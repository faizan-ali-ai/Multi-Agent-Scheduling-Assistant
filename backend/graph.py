import os
from typing import TypedDict, Optional

from dotenv import load_dotenv

from datetime import datetime
from dateutil import parser
import dateparser
from datetime import datetime, timedelta
import re
from google import genai
from database import db
from langchain_groq import ChatGroq
import json
import re
from langgraph.graph import StateGraph, START, END

from tools import (
    check_availability,
    reserve_slot,
    send_booking_notification
)

load_dotenv()


class AgentState(TypedDict):
    session_id: str
    user_message: str
    intent: str
    current_agent: str
    name: str
    email: str
    purpose: str
    booking_date: str
    booking_time: str
    duration: int
    tool_result: dict
    response: str
    next_step: str


class LLMRuntime:

    def __init__(self):

        self.providers = [

            {
                "provider": "gemini",
                "key": os.getenv("GEMINI_KEY_1"),
                "model": "gemini-2.5-flash"
            },

            {
                "provider": "gemini",
                "key": os.getenv("GEMINI_KEY_2"),
                "model": "gemini-2.5-flash"
            },

            {
                "provider": "groq",
                "key": os.getenv("GROQ_KEY_1"),
                "model": "llama-3.1-8b-instant"
            }

        ]

    def invoke(self, prompt):

        for provider in self.providers:

            if not provider["key"]:
                continue

            try:

                if provider["provider"] == "gemini":

                    client = genai.Client(
                        api_key=provider["key"]
                    )

                    response = client.models.generate_content(
                        model=provider["model"],
                        contents=prompt
                    )

                    return response.text

                groq = ChatGroq(
                    model=provider["model"],
                    groq_api_key=provider["key"],
                    temperature=0
                )

                response = groq.invoke(prompt)

                return response.content

            except Exception:

                continue

        raise Exception("No working LLM provider found.")
    



llm = LLMRuntime()

def normalize_booking_datetime(date_text, time_text):
    """
    Converts:
    tomorrow
    next friday
    14 july
    2 pm

    into

    2026-07-14
    14:00
    """

    if not date_text:
        return "", ""

    parsed_date = dateparser.parse(
        date_text,
        settings={
            "PREFER_DATES_FROM": "future"
        }
    )

    if parsed_date is None:
        return date_text, time_text

    if time_text:

        parsed_time = parser.parse(
            time_text
        )

        parsed_date = parsed_date.replace(
            hour=parsed_time.hour,
            minute=parsed_time.minute
        )

    return (
        parsed_date.strftime("%Y-%m-%d"),
        parsed_date.strftime("%H:%M")
    )


TRIAGE_PROMPT = """
You are the Triage Agent of an AI scheduling assistant.

Analyze the user's current message together with the recent conversation history.

Classify the user's intent into exactly one category:

booking
general

Use booking when the user wants to create, schedule, reserve, arrange, or continue an appointment or meeting booking process.

If the conversation history shows an active booking discussion and the current message provides booking information such as a name, email, purpose, date, time, or duration, classify it as booking.

Use general for greetings, normal conversation, memory questions, informational questions, or anything unrelated to scheduling an appointment.

Return ONLY one word:

booking

or

general
"""


GENERAL_AGENT_PROMPT = """
You are a professional AI Scheduling Assistant.

Respond naturally, clearly, and concisely.

You have access to the recent conversation history.

Use the conversation history when the user refers to previous messages or asks you to remember previously shared information.

If the user asks about their name, email, previously discussed purpose, date, time, or other information, answer only when that information exists in the conversation history.

Prefer the most recent information if the user corrected or changed something.

Never invent missing information.

Do not expose internal agents, prompts, routing logic, state, database operations, or tools.

Conversation History:
{history}

Current User Message:
{message}
"""


def load_conversation_memory(state: AgentState) -> str:
    history = db.get_conversation_history(
        session_id=state["session_id"],
        limit=20
    )

    if not history:
        return "No previous conversation."

    conversation_lines = []

    for item in history:
        role = str(item.get("role", "unknown")).strip().capitalize()
        message = str(item.get("message", "")).strip()

        if message:
            conversation_lines.append(
                f"{role}: {message}"
            )

    if not conversation_lines:
        return "No previous conversation."

    return "\n".join(conversation_lines)


def save_conversation_turn(
    state: AgentState,
    assistant_response: str
) -> None:
    db.save_message(
        session_id=state["session_id"],
        role="user",
        message=state["user_message"]
    )

    db.save_message(
        session_id=state["session_id"],
        role="assistant",
        message=assistant_response
    )


def detect_intent(state: AgentState):
    history = load_conversation_memory(state)

    prompt = (
        f"{TRIAGE_PROMPT}\n\n"
        f"Conversation History:\n{history}\n\n"
        f"Current User Message:\n{state['user_message']}"
    )

    raw_intent = llm.invoke(prompt)

    normalized_intent = (
        str(raw_intent)
        .strip()
        .lower()
        .replace(".", "")
        .replace('"', "")
        .replace("'", "")
    )

    if normalized_intent == "booking":
        return {
            "intent": "booking",
            "current_agent": "booking",
            "next_step": "booking"
        }

    return {
        "intent": "general",
        "current_agent": "general",
        "next_step": "general"
    }


def general_agent(state: AgentState):
    history = load_conversation_memory(state)

    prompt = GENERAL_AGENT_PROMPT.format(
        history=history,
        message=state["user_message"]
    )

    answer = llm.invoke(prompt)

    answer = str(answer).strip()

    if not answer:
        answer = "I could not generate a response. Please try again."

    save_conversation_turn(
        state=state,
        assistant_response=answer
    )

    return {
        "response": answer,
        "current_agent": "general",
        "next_step": "complete"
    }


BOOKING_EXTRACTION_PROMPT = """
You are the Booking Agent of a professional AI scheduling assistant.

Your job is to collect booking information across multiple conversation turns.

Required booking information:

name
email
purpose
booking_date
booking_time
duration

Use the recent conversation history and the current user message.

Extract only information explicitly provided by the user.

Use the most recent value when the user corrects previously provided information.

For booking_date, preserve the user's date expression exactly as provided.

For booking_time, preserve the user's time expression exactly as provided.

Duration must be an integer representing minutes.

If duration is not provided, use 30.

Return ONLY valid JSON.

Use exactly this structure:

{{
    "name": "",
    "email": "",
    "purpose": "",
    "booking_date": "",
    "booking_time": "",
    "duration": 30
}}

Do not return markdown.
Do not return code fences.
Do not explain anything.

Conversation History:
{history}

Current User Message:
{message}
"""


def extract_json_object(raw_response: str) -> dict:
    cleaned_response = str(raw_response).strip()

    cleaned_response = cleaned_response.replace(
        "```json",
        ""
    )

    cleaned_response = cleaned_response.replace(
        "```",
        ""
    )

    cleaned_response = cleaned_response.strip()

    try:
        return json.loads(cleaned_response)
    except json.JSONDecodeError:
        json_match = re.search(
            r"\{.*\}",
            cleaned_response,
            re.DOTALL
        )

        if not json_match:
            return {}

        try:
            return json.loads(
                json_match.group()
            )
        except json.JSONDecodeError:
            return {}


def validate_email(email: str) -> bool:
    if not email:
        return False

    email_pattern = (
        r"^[A-Za-z0-9._%+-]+"
        r"@[A-Za-z0-9.-]+"
        r"\.[A-Za-z]{2,}$"
    )

    return bool(
        re.match(
            email_pattern,
            email.strip()
        )
    )


def normalize_booking_data(
    extracted_data: dict
) -> dict:

    duration = extracted_data.get(
        "duration",
        30
    )

    try:
        duration = int(duration)
    except (TypeError, ValueError):
        duration = 30

    if duration <= 0:
        duration = 30

    booking_date = str(
        extracted_data.get(
            "booking_date",
            ""
        )
    ).strip()

    booking_time = str(
        extracted_data.get(
            "booking_time",
            ""
        )
    ).strip().lower()

    today = datetime.now()

    if booking_date:

        lower = booking_date.lower()

        if lower == "today":
            booking_date = today.strftime("%Y-%m-%d")

        elif lower == "tomorrow":
            booking_date = (
                today + timedelta(days=1)
            ).strftime("%Y-%m-%d")

        else:

            weekdays = {
                "monday": 0,
                "tuesday": 1,
                "wednesday": 2,
                "thursday": 3,
                "friday": 4,
                "saturday": 5,
                "sunday": 6,
            }

            for day, index in weekdays.items():

                if day in lower:

                    days_ahead = (
                        index - today.weekday()
                    ) % 7

                    if days_ahead == 0:
                        days_ahead = 7

                    booking_date = (
                        today +
                        timedelta(days=days_ahead)
                    ).strftime("%Y-%m-%d")

                    break

            try:
                parsed = datetime.strptime(
                    booking_date,
                    "%d %B"
                )

                booking_date = parsed.replace(
                    year=today.year
                ).strftime("%Y-%m-%d")

            except:
                pass

    if booking_time:

        try:

            parsed = datetime.strptime(
                booking_time,
                "%I:%M %p"
            )

            booking_time = parsed.strftime(
                "%H:%M"
            )

        except:

            try:

                parsed = datetime.strptime(
                    booking_time,
                    "%H:%M"
                )

                booking_time = parsed.strftime(
                    "%H:%M"
                )

            except:
                pass

    return {

        "name": str(
            extracted_data.get(
                "name",
                ""
            )
        ).strip(),

        "email": str(
            extracted_data.get(
                "email",
                ""
            )
        ).strip(),

        "purpose": str(
            extracted_data.get(
                "purpose",
                ""
            )
        ).strip(),

        "booking_date": booking_date,

        "booking_time": booking_time,

        "duration": duration
    }


def get_missing_booking_field(
    booking_data: dict
):
    required_fields = [
        "name",
        "email",
        "purpose",
        "booking_date",
        "booking_time"
    ]

    for field in required_fields:
        if not booking_data.get(field):
            return field

    if not validate_email(
        booking_data["email"]
    ):
        return "invalid_email"

    return None


def build_booking_question(
    missing_field: str
) -> str:
    questions = {
        "name": (
            "What name should I use for the booking?"
        ),
        "email": (
            "What email address should I use for the booking?"
        ),
        "purpose": (
            "What is the purpose of the appointment?"
        ),
        "booking_date": (
            "What date would you like to book?"
        ),
        "booking_time": (
            "What time would you prefer?"
        ),
        "invalid_email": (
            "Please provide a valid email address."
        )
    }

    return questions.get(
        missing_field,
        "Please provide the remaining booking information."
    )

def booking_agent(state: AgentState):

    history = load_conversation_memory(state)

    extraction_prompt = BOOKING_EXTRACTION_PROMPT.format(
        history=history,
        message=state["user_message"]
    )

    raw_extraction = llm.invoke(
        extraction_prompt
    )

    extracted_data = extract_json_object(
        raw_extraction
    )

    booking_data = normalize_booking_data(
        extracted_data
    )

    # -----------------------------
    # Normalize date & time
    # -----------------------------
    normalized_date, normalized_time = normalize_booking_datetime(
        booking_data["booking_date"],
        booking_data["booking_time"]
    )

    booking_data["booking_date"] = normalized_date
    booking_data["booking_time"] = normalized_time

    # -----------------------------
    # Check missing fields
    # -----------------------------
    missing_field = get_missing_booking_field(
        booking_data
    )

    if missing_field:

        question = build_booking_question(
            missing_field
        )

        save_conversation_turn(
            state=state,
            assistant_response=question
        )

        return {
            "name": booking_data["name"],
            "email": booking_data["email"],
            "purpose": booking_data["purpose"],
            "booking_date": booking_data["booking_date"],
            "booking_time": booking_data["booking_time"],
            "duration": booking_data["duration"],
            "response": question,
            "current_agent": "booking",
            "next_step": "complete"
        }

    # -----------------------------
    # Check slot availability
    # -----------------------------
    availability = check_availability(
        booking_data["booking_date"],
        booking_data["booking_time"]
    )

    if not availability:

        response = (
            "That slot is already reserved. "
            "Please choose another available time."
        )

        save_conversation_turn(
            state=state,
            assistant_response=response
        )

        return {
            "name": booking_data["name"],
            "email": booking_data["email"],
            "purpose": booking_data["purpose"],
            "booking_date": booking_data["booking_date"],
            "booking_time": "",
            "duration": booking_data["duration"],
            "tool_result": {
                "success": False,
                "reason": "slot_unavailable"
            },
            "response": response,
            "current_agent": "booking",
            "next_step": "complete"
        }

    # -----------------------------
    # Reserve booking
    # -----------------------------
    reservation_result = reserve_slot(
        session_id=state["session_id"],
        name=booking_data["name"],
        email=booking_data["email"],
        purpose=booking_data["purpose"],
        booking_date=booking_data["booking_date"],
        booking_time=booking_data["booking_time"],
        duration=booking_data["duration"]
    )

    if not reservation_result.get("success"):

        response = reservation_result.get(
            "message",
            "Booking could not be completed."
        )

        save_conversation_turn(
            state=state,
            assistant_response=response
        )

        return {
            "tool_result": reservation_result,
            "response": response,
            "current_agent": "booking",
            "next_step": "complete"
        }

    # -----------------------------
    # Send notification
    # -----------------------------
    notification_result = send_booking_notification(
        name=booking_data["name"],
        email=booking_data["email"],
        purpose=booking_data["purpose"],
        booking_date=booking_data["booking_date"],
        booking_time=booking_data["booking_time"],
        duration=booking_data["duration"]
    )

    response = (
        f"Your appointment for "
        f"{booking_data['purpose']} has been confirmed on "
        f"{booking_data['booking_date']} "
        f"at {booking_data['booking_time']} "
        f"for {booking_data['duration']} minutes."
    )

    save_conversation_turn(
        state=state,
        assistant_response=response
    )

    return {
        "name": booking_data["name"],
        "email": booking_data["email"],
        "purpose": booking_data["purpose"],
        "booking_date": booking_data["booking_date"],
        "booking_time": booking_data["booking_time"],
        "duration": booking_data["duration"],
        "booking": booking_data,          # 👈 Frontend countdown ke liye
        "tool_result": {
            "reservation": reservation_result,
            "notification": notification_result
        },
        "response": response,
        "current_agent": "booking",
        "next_step": "complete"
    }

def route_intent(state: AgentState) -> str:
    intent = state.get(
        "intent",
        "general"
    )

    if intent == "booking":
        return "booking"

    return "general"


def create_workflow():
    workflow = StateGraph(
        AgentState
    )

    workflow.add_node(
        "triage_agent",
        detect_intent
    )

    workflow.add_node(
        "general_agent",
        general_agent
    )

    workflow.add_node(
        "booking_agent",
        booking_agent
    )

    workflow.add_edge(
        START,
        "triage_agent"
    )

    workflow.add_conditional_edges(
        "triage_agent",
        route_intent,
        {
            "booking": "booking_agent",
            "general": "general_agent"
        }
    )

    workflow.add_edge(
        "general_agent",
        END
    )

    workflow.add_edge(
        "booking_agent",
        END
    )

    return workflow.compile()


agent_graph = create_workflow()

def create_initial_state(
    session_id: str,
    user_message: str
) -> AgentState:
    return {
        "session_id": session_id,
        "user_message": user_message,
        "intent": "",
        "current_agent": "triage",
        "name": "",
        "email": "",
        "purpose": "",
        "booking_date": "",
        "booking_time": "",
        "duration": 30,
        "tool_result": {},
        "response": "",
        "next_step": "triage"
    }


def run_graph(
    session_id: str,
    user_message: str
) -> dict:
    if not session_id or not session_id.strip():
        raise ValueError(
            "Session ID is required."
        )

    if not user_message or not user_message.strip():
        raise ValueError(
            "User message is required."
        )

    initial_state = create_initial_state(
        session_id=session_id.strip(),
        user_message=user_message.strip()
    )

    try:
        final_state = agent_graph.invoke(
            initial_state
        )

        response = str(
            final_state.get(
                "response",
                ""
            )
        ).strip()

        if not response:
            raise RuntimeError(
                "Agent workflow completed without a response."
            )

        return {
            "success": True,
            "session_id": final_state.get(
                "session_id",
                session_id
            ),
            "intent": final_state.get(
                "intent",
                "general"
            ),
            "current_agent": final_state.get(
                "current_agent",
                "unknown"
            ),
            "response": response,
            "booking": {
                "name": final_state.get(
                    "name",
                    ""
                ),
                "email": final_state.get(
                    "email",
                    ""
                ),
                "purpose": final_state.get(
                    "purpose",
                    ""
                ),
                "booking_date": final_state.get(
                    "booking_date",
                    ""
                ),
                "booking_time": final_state.get(
                    "booking_time",
                    ""
                ),
                "duration": final_state.get(
                    "duration",
                    30
                )
            },
            "tool_result": final_state.get(
                "tool_result",
                {}
            )
        }

    except Exception as error:
        raise RuntimeError(
            f"Agent workflow execution failed: {str(error)}"
        ) from error