import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  LoaderCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';

import type {
  ChatSession,
  Agent,
  Message,
  AgentType,
} from './types';

import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const AGENTS: Agent[] = [
  {
    id: 'triage' as AgentType,
    name: 'Triage Agent',
    role: 'Request Router',
    color: '#6366F1',
    avatar: '',
    description: 'Analyzes requests and routes scheduling tasks.',
  },
  {
    id: 'booking' as AgentType,
    name: 'Booking Specialist',
    role: 'Scheduling Agent',
    color: '#10B981',
    avatar: '',
    description:
      'Checks availability, negotiates slots, and reserves bookings.',
  },
];

type Booking = {
  id?: number;
  session_id?: string;
  name?: string;
  email?: string;
  purpose?: string;
  booking_date: string;
  booking_time: string;
  duration?: number;
  status?: string;
  created_at?: string;
};

type ChatApiResponse = {
  success: boolean;
  session_id: string;
  intent: string;
  current_agent: string;
  response: string;
  booking?: Booking | null;
  tool_result?: Record<string, unknown>;
};

type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
};

type SchedulingState = 'idle' | 'processing' | 'confirmed';

const createSessionId = () =>
  `session-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 9)}`;

const createInitialMessage = (): Message => ({
  id: `message-${Date.now()}`,
  role: 'assistant',
  text: `**Welcome to Multi-Agent Scheduling Assistant.**

Tell me what you would like to schedule. I can check availability, suggest alternative slots, reserve your appointment, and remember details throughout this conversation.`,
  agent: 'triage' as AgentType,
  timestamp: new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  }),
});

const createSession = (): ChatSession => ({
  id: createSessionId(),
  title: 'New Scheduling Session',
  messages: [createInitialMessage()],
  createdAt: new Date().toISOString(),
});

const emptyCountdown = (): Countdown => ({
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  expired: false,
});

const calculateCountdown = (
  booking?: Booking | null
): Countdown => {
  if (!booking?.booking_date || !booking?.booking_time) {
    return emptyCountdown();
  }

  const normalizedTime =
    booking.booking_time.length === 5
      ? `${booking.booking_time}:00`
      : booking.booking_time;

  const target = new Date(
    `${booking.booking_date}T${normalizedTime}`
  ).getTime();

  if (Number.isNaN(target)) {
    return emptyCountdown();
  }

  const difference = target - Date.now();

  if (difference <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
    };
  }

  return {
    days: Math.floor(difference / 86400000),
    hours: Math.floor(
      (difference % 86400000) / 3600000
    ),
    minutes: Math.floor(
      (difference % 3600000) / 60000
    ),
    seconds: Math.floor(
      (difference % 60000) / 1000
    ),
    expired: false,
  };
};

const isBookingAgent = (agent?: string) => {
  if (!agent) {
    return false;
  }

  const normalized = agent.toLowerCase();

  return (
    normalized === 'booking' ||
    normalized === 'booking_specialist' ||
    normalized.includes('booking')
  );
};

const isSchedulingIntent = (intent?: string) => {
  if (!intent) {
    return false;
  }

  const normalized = intent.toLowerCase();

  const schedulingKeywords = [
    'booking',
    'book',
    'schedule',
    'scheduling',
    'availability',
    'available',
    'reserve',
    'reservation',
    'meeting',
    'appointment',
    'slot',
  ];

  return schedulingKeywords.some((keyword) =>
    normalized.includes(keyword)
  );
};

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const [isProcessing, setIsProcessing] = useState(false);

  const [activeAgents, setActiveAgents] = useState<AgentType[]>(
    []
  );

  const [error, setError] = useState<string | null>(null);

  const [booking, setBooking] = useState<Booking | null>(null);

  const [countdown, setCountdown] = useState<Countdown>(
    emptyCountdown()
  );

  const [showSuccess, setShowSuccess] = useState(false);

  const [schedulingState, setSchedulingState] =
    useState<SchedulingState>('idle');

  const bookingIdRef = useRef<number | undefined>(undefined);

  const currentSession = useMemo(
    () =>
      sessions.find(
        (session) => session.id === currentSessionId
      ),
    [sessions, currentSessionId]
  );

  useEffect(() => {
    const storedTheme = localStorage.getItem(
      'scheduler-theme'
    ) as 'light' | 'dark' | null;

    const initialTheme = storedTheme || 'light';

    setTheme(initialTheme);

    document.documentElement.classList.toggle(
      'dark',
      initialTheme === 'dark'
    );

    const storedSessions = localStorage.getItem(
      'scheduler-sessions'
    );

    if (storedSessions) {
      try {
        const parsed = JSON.parse(
          storedSessions
        ) as ChatSession[];

        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
          return;
        }
      } catch {
        localStorage.removeItem('scheduler-sessions');
      }
    }

    const initialSession = createSession();

    setSessions([initialSession]);
    setCurrentSessionId(initialSession.id);

    localStorage.setItem(
      'scheduler-sessions',
      JSON.stringify([initialSession])
    );
  }, []);

  useEffect(() => {
    if (!currentSessionId) {
      setBooking(null);
      setSchedulingState('idle');
      bookingIdRef.current = undefined;
      return;
    }

    const loadBooking = async () => {
      setBooking(null);
      setSchedulingState('idle');
      bookingIdRef.current = undefined;

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/bookings/${currentSessionId}`
        );

        if (response.status === 404) {
          return;
        }

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        const existingBooking =
          (data.booking as Booking | null) || null;

        if (
          existingBooking &&
          existingBooking.status?.toUpperCase() === 'CONFIRMED'
        ) {
          setBooking(existingBooking);
          setSchedulingState('confirmed');
          bookingIdRef.current = existingBooking.id;
        }
      } catch {
        setBooking(null);
        setSchedulingState('idle');
      }
    };

    loadBooking();
  }, [currentSessionId]);

  useEffect(() => {
    setCountdown(calculateCountdown(booking));

    if (!booking) {
      return;
    }

    const interval = window.setInterval(() => {
      setCountdown(calculateCountdown(booking));
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [booking]);

  const saveSessions = (
    updatedSessions: ChatSession[]
  ) => {
    setSessions(updatedSessions);

    localStorage.setItem(
      'scheduler-sessions',
      JSON.stringify(updatedSessions)
    );
  };

  const updateSession = (
    sessionId: string,
    updater: (session: ChatSession) => ChatSession
  ) => {
    setSessions((previousSessions) => {
      const updatedSessions = previousSessions.map((session) =>
        session.id === sessionId
          ? updater(session)
          : session
      );

      localStorage.setItem(
        'scheduler-sessions',
        JSON.stringify(updatedSessions)
      );

      return updatedSessions;
    });
  };

  const handleToggleTheme = () => {
    const nextTheme =
      theme === 'light' ? 'dark' : 'light';

    setTheme(nextTheme);

    localStorage.setItem(
      'scheduler-theme',
      nextTheme
    );

    document.documentElement.classList.toggle(
      'dark',
      nextTheme === 'dark'
    );
  };

  const handleNewSession = () => {
    const newSession = createSession();

    setSessions((previousSessions) => {
      const updatedSessions = [
        newSession,
        ...previousSessions,
      ];

      localStorage.setItem(
        'scheduler-sessions',
        JSON.stringify(updatedSessions)
      );

      return updatedSessions;
    });

    setCurrentSessionId(newSession.id);
    setBooking(null);
    setSchedulingState('idle');
    setCountdown(emptyCountdown());
    setShowSuccess(false);
    setError(null);

    bookingIdRef.current = undefined;
  };

  const handleDeleteSession = (
    sessionId: string
  ) => {
    const remainingSessions = sessions.filter(
      (session) => session.id !== sessionId
    );

    if (remainingSessions.length === 0) {
      const newSession = createSession();

      saveSessions([newSession]);
      setCurrentSessionId(newSession.id);
      setBooking(null);
      setSchedulingState('idle');
      bookingIdRef.current = undefined;

      return;
    }

    saveSessions(remainingSessions);

    if (currentSessionId === sessionId) {
      setCurrentSessionId(remainingSessions[0].id);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (
      !currentSession ||
      isProcessing ||
      !text.trim()
    ) {
      return;
    }

    const requestSessionId = currentSessionId;
    const cleanText = text.trim();

    const userMessage: Message = {
      id: `message-${Date.now()}`,
      role: 'user',
      text: cleanText,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    updateSession(requestSessionId, (session) => ({
      ...session,
      title:
        session.title === 'New Scheduling Session'
          ? cleanText.substring(0, 32)
          : session.title,
      messages: [...session.messages, userMessage],
    }));

    setIsProcessing(true);
    setError(null);
    setActiveAgents(['triage' as AgentType]);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: requestSessionId,
            message: cleanText,
          }),
        }
      );

      const data =
        (await response.json()) as ChatApiResponse;

      if (!response.ok) {
        throw new Error(
          (
            data as {
              detail?: string;
            }
          ).detail || "Scheduling request failed."
        );
      }

      const bookingWorkflow =
        isBookingAgent(data.current_agent) ||
        isSchedulingIntent(data.intent);

      const resolvedAgent: AgentType =
        isBookingAgent(data.current_agent)
          ? "booking"
          : "triage";

      setActiveAgents([resolvedAgent]);

      const assistantMessage: Message = {
        id: `message-${Date.now()}-assistant`,
        role: "assistant",
        text: data.response,
        agent: resolvedAgent,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      updateSession(requestSessionId, (session) => ({
        ...session,
        messages: [
          ...session.messages,
          assistantMessage,
        ],
      }));

      const confirmedBooking =
        data.booking &&
        (
          data.booking.status ??
          "CONFIRMED"
        ).toUpperCase() === "CONFIRMED";

      if (confirmedBooking && data.booking) {
        const newBooking = data.booking;

        setBooking(newBooking);

        setSchedulingState("confirmed");

        bookingIdRef.current = newBooking.id;

        setShowSuccess(true);

        confetti({
          particleCount: 120,
          spread: 80,
          origin: {
            y: 0.65,
          },
        });

        window.setTimeout(() => {
          setShowSuccess(false);
        }, 4500);
      }
      else if (bookingWorkflow) {
        setSchedulingState("processing");
      }
      else {
        setSchedulingState("idle");
      }

    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to connect to the scheduling service.'
      );

      setSchedulingState((previousState) =>
        previousState === 'confirmed'
          ? 'confirmed'
          : 'idle'
      );
    } finally {
      setIsProcessing(false);
      setActiveAgents([]);
    }
  };

  const formatBookingDate = (
    dateValue: string
  ) => {
    const date = new Date(
      `${dateValue}T00:00:00`
    );

    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    return date.toLocaleDateString([], {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50 text-gray-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <header className="flex h-[72px] flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <CalendarCheck2 className="h-5 w-5" />
          </div>

          <div>
            <h1 className="text-sm font-bold tracking-tight">
              Multi-Agent Scheduling Assistant
            </h1>

            <p className="text-[11px] text-gray-500 dark:text-zinc-500">
              Intelligent agentic scheduling orchestration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          System Online
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          theme={theme}
          onSelectSession={setCurrentSessionId}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onToggleTheme={handleToggleTheme}
        />

        <main className="flex min-w-0 flex-1 gap-4 overflow-hidden bg-gray-100/60 p-4 dark:bg-zinc-900/20">
          <section className="flex min-w-0 flex-1 flex-col">
            {error && (
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />

                <span className="flex-1">
                  {error}
                </span>

                <button
                  onClick={() => setError(null)}
                  className="font-semibold"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1">
              <ChatWindow
                messages={
                  currentSession?.messages || []
                }
                agents={AGENTS}
                isProcessing={isProcessing}
                onSendMessage={handleSendMessage}
              />
            </div>
          </section>

          <aside className="hidden w-[390px] flex-shrink-0 xl:flex">
            <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-gray-100 p-5 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                    <Clock3 className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="text-sm font-bold">
                      Upcoming Appointment
                    </h2>

                    <p className="text-[11px] text-gray-500 dark:text-zinc-500">
                      Live booking status and countdown
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-center p-6">
                {schedulingState === 'confirmed' &&
                booking ? (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                        <CalendarCheck2 className="h-7 w-7" />
                      </div>

                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600">
                        {booking.status || 'CONFIRMED'}
                      </p>

                      <h3 className="mt-2 text-xl font-bold">
                        {booking.purpose ||
                          'Scheduled Appointment'}
                      </h3>

                      <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
                        {formatBookingDate(
                          booking.booking_date
                        )}
                      </p>

                      <p className="mt-1 text-sm font-semibold">
                        {booking.booking_time}

                        {booking.duration
                          ? ` · ${booking.duration} minutes`
                          : ''}
                      </p>
                    </div>

                    <div>
                      <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                        {countdown.expired
                          ? 'Appointment time reached'
                          : 'Starts in'}
                      </p>

                      <div className="grid grid-cols-4 gap-2">
                        {[
                          ['Days', countdown.days],
                          ['Hours', countdown.hours],
                          ['Min', countdown.minutes],
                          ['Sec', countdown.seconds],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <p className="font-mono text-xl font-bold">
                              {String(value).padStart(
                                2,
                                '0'
                              )}
                            </p>

                            <p className="mt-1 text-[9px] uppercase tracking-wider text-gray-400">
                              {label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-zinc-300">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        Slot reserved successfully
                      </div>

                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-zinc-300">
                        <BellRing className="h-4 w-4 text-indigo-500" />
                        Mock notification processed
                      </div>
                    </div>
                  </div>
                ) : schedulingState === 'processing' ||
                  isProcessing ? (
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                      <LoaderCircle className="h-7 w-7 animate-spin" />
                    </div>

                    <h3 className="text-base font-bold">
                      Scheduling In Progress
                    </h3>

                    <p className="mx-auto mt-2 max-w-[260px] text-xs leading-5 text-gray-500 dark:text-zinc-500">
                      The scheduling agents are checking
                      availability and processing your request.
                    </p>

                    <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-2 text-[11px] font-medium text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      Booking agent working
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-zinc-800 dark:text-zinc-500">
                      <CalendarCheck2 className="h-7 w-7" />
                    </div>

                    <h3 className="text-base font-bold">
                      No Upcoming Appointment
                    </h3>

                    <p className="mx-auto mt-2 max-w-[260px] text-xs leading-5 text-gray-500 dark:text-zinc-500">
                      Ask the scheduling assistant to check
                      availability and reserve a meeting slot.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </main>
      </div>

      {showSuccess && booking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-7 text-center shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <h2 className="mt-5 text-xl font-bold">
              Booking Confirmed
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-zinc-400">
              Your slot has been successfully reserved and
              the mock notification has been processed.
            </p>

            <div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs dark:bg-zinc-950">
              <p className="font-semibold">
                {booking.purpose ||
                  'Scheduled Appointment'}
              </p>

              <p className="mt-1 text-gray-500 dark:text-zinc-400">
                {formatBookingDate(
                  booking.booking_date
                )}{' '}
                · {booking.booking_time}
              </p>
            </div>

            <button
              onClick={() => setShowSuccess(false)}
              className="mt-6 w-full rounded-xl bg-gray-900 px-4 py-3 text-xs font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-black"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}