import os

from contextlib import asynccontextmanager

from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel, Field

from database import db
from graph import run_graph


load_dotenv()


class ChatRequest(BaseModel):
    session_id: str = Field(
        min_length=1,
        max_length=150
    )

    message: str = Field(
        min_length=1,
        max_length=5000
    )


class ChatResponse(BaseModel):
    success: bool
    session_id: str
    intent: str
    current_agent: str
    response: str
    booking: dict
    tool_result: dict


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Agentic AI Scheduling Assistant API",
    description="Multi-agent scheduling assistant powered by LangGraph",
    version="1.0.0",
    lifespan=lifespan
)


allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "*"
    ).split(",")
    if origin.strip()
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=(
        allowed_origins != ["*"]
    ),
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/")
async def root():
    return {
        "status": "ONLINE",
        "service": "Agentic AI Scheduling Assistant API",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    return {
        "success": True,
        "status": "healthy"
    }


@app.post(
    "/api/v1/chat",
    response_model=ChatResponse
)
async def chat(request: ChatRequest):
    try:
        result = run_graph(
            session_id=request.session_id,
            user_message=request.message
        )


        return result

    except Exception as error:
        import traceback


        raise HTTPException(
            status_code=500,
            detail=f"{type(error).__name__}: {str(error)}"
        ) from error


@app.get(
    "/api/v1/bookings/{session_id}"
)
async def get_booking(session_id: str):
    try:
        booking = db.get_booking(
            session_id=session_id
        )

        return {
            "success": True,
            "booking": booking
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve booking."
        ) from error


@app.get(
    "/api/v1/conversations/{session_id}"
)
async def get_conversation_history(
    session_id: str
):
    try:
        history = db.get_conversation_history(
            session_id=session_id,
            limit=20
        )

        return {
            "success": True,
            "session_id": session_id,
            "history": history
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve conversation history."
        ) from error
    


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(
            os.getenv(
                "PORT",
                "8000"
            )
        )
    )