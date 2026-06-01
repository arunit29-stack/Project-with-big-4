"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type Role = "student" | "teacher";
type QuizPhase = "lobby" | "question" | "leaderboard" | "complete";
type SocketState = "connecting" | "connected" | "reconnecting" | "offline";
type QuestionType = "mcq" | "true_false";
type BadgeKind = "On Fire" | "Unstoppable" | "Perfect Run" | "Flawless";

interface LiveQuizProps {
  courseId: string;
  role: Role;
}

interface QuizQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options: string[];
  correctOptionId: string;
  seconds: number;
}

interface AnswerOption {
  id: string;
  label: string;
  text: string;
}

interface AttendanceStudent {
  id: string;
  displayName: string;
  joinedAt: string;
}

interface RankedStudent {
  id: string;
  displayName: string;
  xp: number;
  streak: number;
  correct: number;
}

interface AnswerDistribution {
  questionId: string;
  counts: Record<string, number>;
}

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
const bottomFollowUpPercent = Number(
  process.env.NEXT_PUBLIC_QUIZ_FOLLOW_UP_PERCENT ?? 20,
);

const COURSE_NAME = "Biology 101";
const QUIZ_TITLE = "Photosynthesis Sprint";
const QUIZ_ID = "quiz-photosynthesis-sprint";

const QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    text: "Which molecule stores short-term energy produced during photosynthesis?",
    type: "mcq",
    options: ["Glucose", "ATP", "Oxygen", "Carbon dioxide"],
    correctOptionId: "B",
    seconds: 25,
  },
  {
    id: "q2",
    text: "True or false: chlorophyll absorbs green wavelengths most strongly.",
    type: "true_false",
    options: ["True", "False"],
    correctOptionId: "B",
    seconds: 18,
  },
  {
    id: "q3",
    text: "Where do the light-dependent reactions happen?",
    type: "mcq",
    options: ["Stroma", "Thylakoid membrane", "Nucleus", "Cytoplasm"],
    correctOptionId: "B",
    seconds: 22,
  },
];

const INITIAL_ATTENDANCE: AttendanceStudent[] = [
  { id: "s1", displayName: "Ananya Rao", joinedAt: new Date().toISOString() },
  { id: "s2", displayName: "Kabir Sen", joinedAt: new Date().toISOString() },
  { id: "s3", displayName: "Rohan Das", joinedAt: new Date().toISOString() },
  { id: "s4", displayName: "Mina Patel", joinedAt: new Date().toISOString() },
];

const INITIAL_RANKS: RankedStudent[] = [
  { id: "s1", displayName: "Ananya Rao", xp: 420, streak: 4, correct: 2 },
  { id: "s2", displayName: "Kabir Sen", xp: 390, streak: 3, correct: 2 },
  { id: "s3", displayName: "Rohan Das", xp: 310, streak: 1, correct: 1 },
  { id: "s4", displayName: "Mina Patel", xp: 280, streak: 0, correct: 1 },
  { id: "me", displayName: "You", xp: 360, streak: 2, correct: 2 },
  { id: "s5", displayName: "Sara Ali", xp: 220, streak: 0, correct: 0 },
  { id: "s6", displayName: "Dev Kumar", xp: 180, streak: 0, correct: 0 },
];

function optionFor(question: QuizQuestion, index: number): AnswerOption {
  const label = question.type === "true_false" ? (index === 0 ? "T" : "F") : "ABCD"[index];

  return {
    id: label,
    label,
    text: question.options[index],
  };
}

function pct(part: number, total: number) {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = total === 0 ? 0 : remaining / total;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="relative h-28 w-28">
      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="stroke-slate-200"
          strokeWidth="8"
          fill="none"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={remaining <= 5 ? "stroke-red-500" : "stroke-brand-600"}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-slate-950">{remaining}</span>
      </div>
    </div>
  );
}

function LobbyCountdown({ seconds }: { seconds: number }) {
  return (
    <div className="flex items-center justify-center">
      <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-600/20">
        <div className="absolute inset-0 rounded-full border-8 border-brand-200 animate-ping" />
        <div className="relative text-center">
          <div className="text-6xl font-black tabular-nums">{seconds}</div>
          <div className="text-xs font-bold uppercase tracking-wide text-brand-100">seconds</div>
        </div>
      </div>
    </div>
  );
}

function OfflineBanner({ state }: { state: SocketState }) {
  if (state === "connected") return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
      Real-time quiz connection is unavailable.
      {state === "reconnecting" && <span className="ml-2">Reconnecting...</span>}
    </div>
  );
}

function DistributionChart({
  question,
  distribution,
}: {
  question: QuizQuestion;
  distribution: AnswerDistribution;
}) {
  const options = question.options.map((_, index) => optionFor(question, index));
  const total = Object.values(distribution.counts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">Live answer distribution</h3>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {total} answers
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {options.map((option) => {
          const count = distribution.counts[option.id] ?? 0;
          const width = pct(count, total);

          return (
            <div key={option.id}>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                <span>
                  {option.label}. {option.text}
                </span>
                <span>{width}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full rounded ${
                    option.id === question.correctOptionId ? "bg-emerald-500" : "bg-brand-500"
                  }`}
                  style={{ width: `${width}%`, transition: "width 280ms ease" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BadgeToast({
  badge,
  onClose,
}: {
  badge: BadgeKind | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!badge) return;
    const timer = window.setTimeout(onClose, 2800);
    return () => window.clearTimeout(timer);
  }, [badge, onClose]);

  if (!badge) return null;

  return (
    <div className="fixed right-5 top-5 z-50 rounded-lg border border-yellow-200 bg-white px-5 py-4 shadow-2xl animate-[quizBadge_480ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-wide text-yellow-700">Badge awarded</p>
      <p className="mt-1 text-xl font-black text-slate-950">{badge}</p>
      <p className="mt-1 text-sm text-slate-600">Saved to your student profile.</p>
    </div>
  );
}

function FlagQuestionForm({
  quizId,
  questionId,
  token,
  onSent,
}: {
  quizId: string;
  questionId: string;
  token: string | null;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  const submitFlag = async () => {
    const trimmed = reason.trim();
    if (!trimmed) return;

    setSent(true);
    setOpen(false);
    setReason("");
    onSent();

    await fetch(`/api/quizzes/${quizId}/questions/${questionId}/flag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reason: trimmed }),
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
        aria-label="Flag question"
        title="Flag question"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 17V4.5M5 4.5C7.8 2.9 9.7 6.1 12.5 4.5C13.3 4 14.1 3.9 15 4.2V11.8C12.2 10.8 10.3 13.8 7.5 12.2C6.7 11.8 5.9 11.6 5 11.8V4.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {sent && <span className="ml-2 text-xs font-medium text-emerald-700">Flag sent</span>}
      {open && (
        <div className="absolute right-0 top-12 z-20 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            One-line reason
          </label>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={120}
            autoFocus
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="button"
            onClick={submitFlag}
            disabled={!reason.trim()}
            className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            Send flag
          </button>
        </div>
      )}
    </div>
  );
}

export function LiveQuiz({ courseId, role }: LiveQuizProps) {
  const { token, user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [phase, setPhase] = useState<QuizPhase>("lobby");
  const [lobbySeconds, setLobbySeconds] = useState(45);
  const [extensionsLeft, setExtensionsLeft] = useState(2);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionSeconds, setQuestionSeconds] = useState(QUESTIONS[0].seconds);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [attendance, setAttendance] = useState<AttendanceStudent[]>(INITIAL_ATTENDANCE);
  const [rankings, setRankings] = useState<RankedStudent[]>(INITIAL_RANKS);
  const [distribution, setDistribution] = useState<AnswerDistribution>({
    questionId: QUESTIONS[0].id,
    counts: { A: 1, B: 2, C: 0, D: 1, T: 0, F: 0 },
  });
  const [badgeToast, setBadgeToast] = useState<BadgeKind | null>(null);
  const [flagNotice, setFlagNotice] = useState(false);

  const isTeacher = role === "teacher";
  const currentQuestion = QUESTIONS[questionIndex];
  const selectedAnswer = answers[currentQuestion.id];
  const sortedRankings = useMemo(
    () => [...rankings].sort((a, b) => b.xp - a.xp),
    [rankings],
  );
  const meId = user?.id ?? "me";
  const myRankIndex = sortedRankings.findIndex((student) => student.id === meId || student.id === "me");
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : 5;
  const myRow = sortedRankings[myRankIndex] ?? sortedRankings.find((student) => student.id === "me");
  const topFive = sortedRankings.slice(0, 5);
  const followUpStart = Math.floor(
    sortedRankings.length * (1 - bottomFollowUpPercent / 100),
  );

  const emitSocket = useCallback((event: string, payload: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  useEffect(() => {
    const socket = io(socketUrl ?? window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token, courseId, quizId: QUIZ_ID },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
      timeout: 8000,
    });

    socketRef.current = socket;
    socket.on("connect", () => setSocketState("connected"));
    socket.io.on("reconnect_attempt", () => setSocketState("reconnecting"));
    socket.io.on("reconnect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("offline"));
    socket.on("connect_error", () => setSocketState("reconnecting"));

    socket.on("quiz:start", () => {
      setPhase("question");
      setQuestionSeconds(QUESTIONS[0].seconds);
    });
    socket.on("quiz:attendance", (students: AttendanceStudent[]) => setAttendance(students));
    socket.on("quiz:answer-distribution", (next: AnswerDistribution) => setDistribution(next));
    socket.on("quiz:leaderboard", (next: RankedStudent[]) => setRankings(next));
    socket.on("quiz:badge-awarded", ({ badge }: { badge: BadgeKind }) => setBadgeToast(badge));

    emitSocket("quiz:join", {
      courseId,
      quizId: QUIZ_ID,
      devicePolicy: "reject-duplicates-silently",
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [courseId, emitSocket, token]);

  useEffect(() => {
    if (phase !== "lobby" || lobbySeconds <= 0 || isTeacher) return;
    const timer = window.setTimeout(() => setLobbySeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [isTeacher, lobbySeconds, phase]);

  const updateRanksAfterQuestion = useCallback(() => {
    setRankings((current) =>
      current
        .map((student) =>
          student.id === "me"
            ? {
                ...student,
                xp: student.xp + (answers[currentQuestion.id] === currentQuestion.correctOptionId ? 120 : 20),
                streak:
                  answers[currentQuestion.id] === currentQuestion.correctOptionId
                    ? student.streak + 1
                    : 0,
                correct:
                  answers[currentQuestion.id] === currentQuestion.correctOptionId
                    ? student.correct + 1
                    : student.correct,
              }
            : student,
        )
        .sort((a, b) => b.xp - a.xp),
    );
  }, [answers, currentQuestion.correctOptionId, currentQuestion.id]);

  useEffect(() => {
    if (phase !== "question") return;
    if (questionSeconds <= 0) {
      if (answers[currentQuestion.id] === undefined) {
        setAnswers((current) => ({ ...current, [currentQuestion.id]: null }));
      }
      setPhase("leaderboard");
      updateRanksAfterQuestion();
      return;
    }

    const timer = window.setTimeout(
      () => setQuestionSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [answers, currentQuestion.id, phase, questionSeconds, updateRanksAfterQuestion]);

  const persistBadge = async (badge: BadgeKind) => {
    setBadgeToast(badge);
    await fetch("/api/students/me/badges", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ badge, courseId, quizId: QUIZ_ID }),
    });
  };

  const startQuiz = () => {
    setPhase("question");
    setQuestionIndex(0);
    setQuestionSeconds(QUESTIONS[0].seconds);
    emitSocket("quiz:start", { courseId, quizId: QUIZ_ID });
  };

  const extendLobby = () => {
    if (extensionsLeft <= 0) return;
    setLobbySeconds((seconds) => seconds + 30);
    setExtensionsLeft((left) => left - 1);
    emitSocket("quiz:lobby-extend", { courseId, quizId: QUIZ_ID, seconds: 30 });
  };

  const selectAnswer = (optionId: string) => {
    if (selectedAnswer !== undefined) return;

    setAnswers((current) => ({ ...current, [currentQuestion.id]: optionId }));
    setDistribution((current) => ({
      questionId: currentQuestion.id,
      counts: {
        ...current.counts,
        [optionId]: (current.counts[optionId] ?? 0) + 1,
      },
    }));

    void fetch(`/api/quizzes/${QUIZ_ID}/answers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        courseId,
        questionId: currentQuestion.id,
        answerOptionId: optionId,
        locked: true,
      }),
    });

    emitSocket("quiz:answer", {
      courseId,
      quizId: QUIZ_ID,
      questionId: currentQuestion.id,
      answerOptionId: optionId,
    });

    if (optionId === currentQuestion.correctOptionId) {
      const nextStreak = (myRow?.streak ?? 0) + 1;
      if (nextStreak === 3) void persistBadge("On Fire");
      if (nextStreak === 5) void persistBadge("Unstoppable");
      if (nextStreak === 10) void persistBadge("Perfect Run");
    }
  };

  const nextQuestion = () => {
    const nextIndex = questionIndex + 1;
    if (nextIndex >= QUESTIONS.length) {
      if ((myRow?.correct ?? 0) + 1 >= QUESTIONS.length) void persistBadge("Flawless");
      setPhase("complete");
      return;
    }

    setQuestionIndex(nextIndex);
    setQuestionSeconds(QUESTIONS[nextIndex].seconds);
    setDistribution({ questionId: QUESTIONS[nextIndex].id, counts: {} });
    setPhase("question");
    emitSocket("quiz:next-question", {
      courseId,
      quizId: QUIZ_ID,
      questionId: QUESTIONS[nextIndex].id,
    });
  };

  const options = currentQuestion.options.map((_, index) => optionFor(currentQuestion, index));

  return (
    <div className="space-y-4">
      <style jsx global>{`
        @keyframes quizBadge {
          0% {
            opacity: 0;
            transform: translateY(-16px) scale(0.92);
          }
          70% {
            transform: translateY(2px) scale(1.03);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
      <BadgeToast badge={badgeToast} onClose={() => setBadgeToast(null)} />
      <OfflineBanner state={socketState} />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{COURSE_NAME}</p>
            <h2 className="text-xl font-bold text-slate-950">{QUIZ_TITLE}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase text-slate-600">
              {phase}
            </span>
            {socketState === "reconnecting" && (
              <span className="rounded bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                Reconnecting...
              </span>
            )}
          </div>
        </div>

        {phase === "lobby" && (
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-h-[520px] flex-col items-center justify-center gap-8 bg-slate-50 p-6 text-center transition-all duration-500">
              <LobbyCountdown seconds={lobbySeconds} />
              <div>
                <h3 className="text-2xl font-black text-slate-950">
                  {isTeacher ? "Lobby is open" : "Waiting for teacher to start..."}
                </h3>
                <p className="mt-2 max-w-md text-sm text-slate-600">
                  Students can join on one device. Duplicate device joins are silently rejected server-side and logged.
                </p>
              </div>
              {isTeacher && (
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={extendLobby}
                    disabled={extensionsLeft <= 0}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Extend Lobby +30s ({extensionsLeft} left)
                  </button>
                  <button
                    type="button"
                    onClick={startQuiz}
                    className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Start Now
                  </button>
                </div>
              )}
            </div>
            <aside className="border-t border-slate-200 p-4 lg:border-l lg:border-t-0">
              {isTeacher ? (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-950">Live attendance</h3>
                    <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">
                      {attendance.length} students
                    </span>
                  </div>
                  <div className="space-y-2">
                    {attendance.map((student) => (
                      <div key={student.id} className="rounded border border-slate-200 px-3 py-2">
                        <p className="text-sm font-medium text-slate-900">{student.displayName}</p>
                        <p className="text-xs text-slate-500">Joined lobby</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-950">Get ready</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    When the teacher starts, the quiz will transition to the first question automatically.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}

        {phase === "question" && (
          <div className="min-h-[580px] p-5 transition-all duration-500">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-brand-700">
                  Question {questionIndex + 1} of {QUESTIONS.length}
                </p>
                <h3 className="mt-2 max-w-3xl text-2xl font-black leading-tight text-slate-950">
                  {currentQuestion.text}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <FlagQuestionForm
                  quizId={QUIZ_ID}
                  questionId={currentQuestion.id}
                  token={token}
                  onSent={() => {
                    setFlagNotice(true);
                    emitSocket("quiz:question-flagged", {
                      courseId,
                      quizId: QUIZ_ID,
                      questionId: currentQuestion.id,
                    });
                  }}
                />
                <CountdownRing remaining={questionSeconds} total={currentQuestion.seconds} />
              </div>
            </div>

            {flagNotice && isTeacher && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                A student flagged this question. You can void it post-quiz.
              </div>
            )}

            <div className={`grid gap-3 ${currentQuestion.type === "true_false" ? "md:grid-cols-2" : "md:grid-cols-2"}`}>
              {options.map((option) => {
                const isSelected = selectedAnswer === option.id;
                const locked = selectedAnswer !== undefined;

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={isTeacher || locked}
                    onClick={() => selectAnswer(option.id)}
                    className={`min-h-28 rounded-lg border px-5 py-4 text-left transition ${
                      isSelected
                        ? "border-brand-600 bg-brand-50 ring-2 ring-brand-200"
                        : "border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/50"
                    } ${locked || isTeacher ? "cursor-default" : ""}`}
                  >
                    <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-lg font-black text-white">
                      {option.label}
                    </span>
                    <span className="block text-lg font-bold text-slate-950">{option.text}</span>
                    {isSelected && (
                      <span className="mt-3 block text-sm font-semibold text-brand-700">
                        Saved and locked
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {isTeacher && (
              <div className="mt-6">
                <DistributionChart question={currentQuestion} distribution={distribution} />
              </div>
            )}
          </div>
        )}

        {phase === "leaderboard" && (
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="p-5">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-brand-700">
                    After question {questionIndex + 1}
                  </p>
                  <h3 className="text-2xl font-black text-slate-950">Leaderboard</h3>
                </div>
                <button
                  type="button"
                  onClick={nextQuestion}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  {questionIndex + 1 >= QUESTIONS.length ? "Finish Quiz" : "Next Question"}
                </button>
              </div>

              {!isTeacher && myRow && (
                <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 p-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-brand-700">Your standing</p>
                  <div className="mt-2 flex flex-wrap items-end gap-5">
                    <div>
                      <span className="text-4xl font-black text-slate-950">#{myRank}</span>
                      <span className="ml-2 text-sm font-semibold text-slate-600">rank</span>
                    </div>
                    <div>
                      <span className="text-4xl font-black text-slate-950">{myRow.xp}</span>
                      <span className="ml-2 text-sm font-semibold text-slate-600">XP</span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">
                    Your personal best in this course: 920 XP
                  </p>
                  <p className="text-sm text-emerald-700">Change from last quiz: +80 XP</p>
                </div>
              )}

              <div className="space-y-2">
                {(isTeacher ? sortedRankings : topFive).map((student, index) => {
                  const isMe = student.id === "me" || student.id === meId;
                  const needsFollowUp = isTeacher && index >= followUpStart;

                  return (
                    <div
                      key={student.id}
                      className={`grid grid-cols-[44px_minmax(0,1fr)_80px] items-center gap-3 rounded-lg border px-3 py-3 ${
                        isMe
                          ? "border-brand-300 bg-brand-50"
                          : needsFollowUp
                            ? "border-amber-200 bg-amber-50"
                            : "border-slate-200 bg-white"
                      }`}
                    >
                      <span className="text-lg font-black text-slate-500">#{index + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">{student.displayName}</p>
                        <p className="text-xs text-slate-500">{student.streak} streak</p>
                      </div>
                      <span className="text-right text-sm font-black text-slate-950">{student.xp} XP</span>
                    </div>
                  );
                })}
                {!isTeacher && myRow && myRank > 5 && (
                  <div className="grid grid-cols-[44px_minmax(0,1fr)_80px] items-center gap-3 rounded-lg border border-brand-300 bg-brand-50 px-3 py-3">
                    <span className="text-lg font-black text-slate-500">#{myRank}</span>
                    <p className="truncate text-sm font-bold text-slate-950">{myRow.displayName}</p>
                    <span className="text-right text-sm font-black text-slate-950">{myRow.xp} XP</span>
                  </div>
                )}
              </div>
            </div>
            <aside className="border-t border-slate-200 p-4 lg:border-l lg:border-t-0">
              <DistributionChart question={currentQuestion} distribution={distribution} />
              {isTeacher && (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Bottom {bottomFollowUpPercent}% is highlighted in amber for optional follow-up.
                </p>
              )}
            </aside>
          </div>
        )}

        {phase === "complete" && (
          <div className="flex min-h-[440px] items-center justify-center bg-slate-50 p-6 text-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-brand-700">Quiz complete</p>
              <h3 className="mt-2 text-3xl font-black text-slate-950">Results are saved</h3>
              <p className="mt-2 max-w-md text-sm text-slate-600">
                Teachers can review flags and void questions post-quiz. Student badges persist to profile.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
