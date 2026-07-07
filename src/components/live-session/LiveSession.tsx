"use client";

import {
  LiveKitRoom,
  ParticipantTile,
  TrackLoop,
  useTracks,
} from "@livekit/components-react";
import { ControlBar } from "@livekit/components-react/prefabs";
import { Track } from "livekit-client";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "@/contexts/AuthContext";
import { formatRelativeTime } from "@/lib/formatRelativeTime";

type Role = "student" | "teacher";
type SocketState = "connecting" | "connected" | "reconnecting" | "offline";
type Quality = "green" | "amber" | "red";

interface LiveSessionProps {
  courseId: string;
  role: Role;
}

interface ChatMessage {
  id: string;
  senderName: string;
  senderRole: Role;
  avatar: string;
  body: string;
  sentAt: string;
  pinned?: boolean;
  removed?: boolean;
  muted?: boolean;
}

interface Participant {
  id: string;
  name: string;
  role: Role;
  quality: Quality;
  micEnabled: boolean;
  videoEnabled: boolean;
  canSpeak: boolean;
}

interface RaisedHand {
  id: string;
  name: string;
}

interface LiveKitCredentials {
  serverUrl: string;
  token: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "msg-1",
    senderName: "Dr. Meera Shah",
    senderRole: "teacher",
    avatar: "MS",
    body: "Pinned notes: today's session focuses on photosynthesis, energy transfer, and the exit question at the end.",
    sentAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    pinned: true,
  },
  {
    id: "msg-2",
    senderName: "Ananya Rao",
    senderRole: "student",
    avatar: "AR",
    body: "Can you repeat why chlorophyll reflects green light?",
    sentAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: "msg-3",
    senderName: "Kabir Sen",
    senderRole: "student",
    avatar: "KS",
    body: "I added a note in the PDF for the ATP step.",
    sentAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
  {
    id: "msg-4",
    senderName: "Dr. Meera Shah",
    senderRole: "teacher",
    avatar: "MS",
    body: "Great question. We will connect that to absorption spectra after the call starts.",
    sentAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
  },
  {
    id: "msg-5",
    senderName: "Rohan Das",
    senderRole: "student",
    avatar: "RD",
    body: "",
    sentAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    removed: true,
  },
];

const INITIAL_PARTICIPANTS: Participant[] = [
  {
    id: "teacher-1",
    name: "Dr. Meera Shah",
    role: "teacher",
    quality: "green",
    micEnabled: true,
    videoEnabled: true,
    canSpeak: true,
  },
  {
    id: "student-1",
    name: "Ananya Rao",
    role: "student",
    quality: "green",
    micEnabled: false,
    videoEnabled: true,
    canSpeak: false,
  },
  {
    id: "student-2",
    name: "Kabir Sen",
    role: "student",
    quality: "amber",
    micEnabled: false,
    videoEnabled: true,
    canSpeak: false,
  },
  {
    id: "student-3",
    name: "Rohan Das",
    role: "student",
    quality: "red",
    micEnabled: false,
    videoEnabled: false,
    canSpeak: false,
  },
];

const qualityClasses: Record<Quality, string> = {
  green: "bg-emerald-500 text-emerald-700",
  amber: "bg-amber-400 text-amber-700",
  red: "bg-red-500 text-red-700",
};

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
const windDownMs = Number(process.env.NEXT_PUBLIC_LIVE_SESSION_WIND_DOWN_MS ?? 10000);

function makeOlderMessages(count: number): ChatMessage[] {
  return Array.from({ length: 6 }, (_, index) => {
    const number = count + index + 1;

    return {
      id: `older-${number}-${Date.now()}`,
      senderName: number % 2 === 0 ? "Dr. Meera Shah" : "Student",
      senderRole: number % 2 === 0 ? "teacher" : "student",
      avatar: number % 2 === 0 ? "MS" : "ST",
      body:
        number % 2 === 0
          ? "Earlier recap added for anyone joining late."
          : "Thanks, I am catching up from the previous example.",
      sentAt: new Date(Date.now() - 1000 * 60 * (20 + number)).toISOString(),
    };
  });
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
        role === "teacher"
          ? "bg-indigo-50 text-indigo-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {role === "teacher" ? "Teacher" : "Student"}
    </span>
  );
}

function QualityIndicator({ quality }: { quality: Quality }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-slate-600">
      <span className={`h-2.5 w-2.5 rounded-full ${qualityClasses[quality].split(" ")[0]}`} />
      {quality}
    </span>
  );
}

function RecBadge({ recording }: { recording: boolean }) {
  if (!recording) return null;

  return (
    <div className="fixed right-5 top-5 z-40 inline-flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-white" />
      REC
    </div>
  );
}

function RecordingConsentModal({
  open,
  onContinue,
  onOptOut,
  isSubmitting,
}: {
  open: boolean;
  onContinue: () => void;
  onOptOut: () => void;
  isSubmitting: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recording-consent-title"
        className="w-full max-w-lg rounded-lg border border-red-200 bg-white shadow-2xl"
      >
        <div className="border-b border-red-100 px-6 py-5">
          <div className="mb-3 inline-flex items-center gap-2 rounded bg-red-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
            <span className="h-2 w-2 rounded-full bg-red-600" />
            Recording started
          </div>
          <h2 id="recording-consent-title" className="text-xl font-semibold text-slate-950">
            This session is being recorded.
          </h2>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm leading-6 text-slate-700">
            By continuing to participate, you consent to being recorded.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onOptOut}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            Opt out of audio
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onContinue}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function LiveKitGrid() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  return (
    <div className="grid min-h-[320px] grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <TrackLoop tracks={tracks}>
        <ParticipantTile className="min-h-56 overflow-hidden rounded-lg border border-slate-700 bg-slate-950 text-white" />
      </TrackLoop>
    </div>
  );
}

function DemoParticipantTile({
  participant,
  isTeacher,
  onToggleMic,
}: {
  participant: Participant;
  isTeacher: boolean;
  onToggleMic: (id: string) => void;
}) {
  return (
    <div className="relative min-h-52 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white">
      <div className="flex h-full min-h-52 items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(14,165,233,0.22),transparent_32%),radial-gradient(circle_at_70%_70%,rgba(16,185,129,0.18),transparent_34%),#020617]">
        {participant.videoEnabled ? (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/12 text-2xl font-semibold">
            {participant.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)}
          </div>
        ) : (
          <div className="text-sm font-medium text-slate-300">Camera off</div>
        )}
      </div>
      <div className="absolute left-3 top-3 flex items-center gap-2 rounded bg-slate-950/70 px-2 py-1 text-xs">
        <span className={`h-2 w-2 rounded-full ${qualityClasses[participant.quality].split(" ")[0]}`} />
        <span>{participant.quality}</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 bg-slate-950/80 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{participant.name}</p>
          <p className="text-xs capitalize text-slate-300">
            {participant.role}
            {!participant.micEnabled ? " · muted" : ""}
          </p>
        </div>
        {(participant.role === "teacher" || isTeacher || participant.canSpeak) && (
          <button
            type="button"
            onClick={() => onToggleMic(participant.id)}
            className="shrink-0 rounded border border-white/20 px-2 py-1 text-xs font-semibold hover:bg-white/10"
          >
            {participant.micEnabled ? "Mute" : "Unmute"}
          </button>
        )}
      </div>
    </div>
  );
}

export function LiveSession({ courseId, role }: LiveSessionProps) {
  const router = useRouter();
  const { token, user } = useAuth();
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [olderLoadCount, setOlderLoadCount] = useState(0);
  const [messageDraft, setMessageDraft] = useState("");
  const [slowModeRemaining, setSlowModeRemaining] = useState(0);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [redirectRemaining, setRedirectRemaining] = useState<number | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [callDisconnected, setCallDisconnected] = useState(false);
  const [reconnectRemaining, setReconnectRemaining] = useState(0);
  const [liveKitCredentials, setLiveKitCredentials] = useState<LiveKitCredentials | null>(null);
  const [participants, setParticipants] = useState<Participant[]>(INITIAL_PARTICIPANTS);
  const [raisedHands, setRaisedHands] = useState<RaisedHand[]>([]);
  const [recording, setRecording] = useState(false);
  const [needsRecordingConsent, setNeedsRecordingConsent] = useState(false);
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [micOptedOut, setMicOptedOut] = useState(false);

  const isTeacher = role === "teacher";
  const pinnedMessages = useMemo(() => messages.filter((message) => message.pinned && !message.removed), [messages]);
  const asyncDiscussionHref = `/${role === "teacher" ? "dashboard" : "class"}/${courseId}?tab=group-rooms`;

  const emitSocket = useCallback((event: string, payload: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = io(socketUrl ?? window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token, courseId },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 8000,
      timeout: 8000,
    });

    socketRef.current = socket;
    setSocketState("connecting");

    socket.on("connect", () => setSocketState("connected"));
    socket.io.on("reconnect_attempt", () => setSocketState("reconnecting"));
    socket.io.on("reconnect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("offline"));
    socket.on("connect_error", () => setSocketState("reconnecting"));

    socket.on("chat:message", (message: ChatMessage) => {
      setMessages((current) => [...current, message]);
    });
    socket.on("chat:pinned", ({ messageId }: { messageId: string }) => {
      setMessages((current) =>
        current.map((message) => ({ ...message, pinned: message.id === messageId })),
      );
    });
    socket.on("chat:removed", ({ messageId }: { messageId: string }) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? { ...message, body: "", removed: true, pinned: false } : message,
        ),
      );
    });
    socket.on("chat:slow-mode", ({ seconds }: { seconds: number }) => {
      setSlowModeRemaining(Math.max(0, seconds));
    });
    socket.on("session:ended", () => {
      setSessionEnded(true);
      setRedirectRemaining(Math.ceil(windDownMs / 1000));
    });
    socket.on("hand:raised", (hand: RaisedHand) => {
      setRaisedHands((current) =>
        current.some((queued) => queued.id === hand.id) ? current : [...current, hand],
      );
    });
    socket.on("rec:started", () => {
      setRecording(true);
      setNeedsRecordingConsent(true);
    });
    socket.on("rec:stopped", () => {
      setRecording(false);
      setNeedsRecordingConsent(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [courseId, token]);

  useEffect(() => {
    if (slowModeRemaining <= 0) return;

    const timer = window.setInterval(() => {
      setSlowModeRemaining((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [slowModeRemaining]);

  useEffect(() => {
    if (redirectRemaining === null) return;

    if (redirectRemaining <= 0) {
      router.push(asyncDiscussionHref);
      return;
    }

    const timer = window.setTimeout(() => {
      setRedirectRemaining((seconds) => (seconds === null ? null : seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [asyncDiscussionHref, redirectRemaining, router]);

  useEffect(() => {
    if (!callDisconnected || reconnectRemaining <= 0) return;

    const timer = window.setInterval(() => {
      setReconnectRemaining((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [callDisconnected, reconnectRemaining]);

  const loadOlderMessages = useCallback(() => {
    setOlderLoadCount((count) => count + 6);
    setMessages((current) => [...makeOlderMessages(olderLoadCount), ...current]);
  }, [olderLoadCount]);

  const handleMessageScroll = () => {
    if (messageListRef.current && messageListRef.current.scrollTop < 24) {
      loadOlderMessages();
    }
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = messageDraft.trim();

    if (!body || sessionEnded || slowModeRemaining > 0) return;

    const message: ChatMessage = {
      id: `local-${Date.now()}`,
      senderName: user?.email?.split("@")[0] ?? (isTeacher ? "Teacher" : "Student"),
      senderRole: role,
      avatar: isTeacher ? "TC" : "ST",
      body,
      sentAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, message]);
    setMessageDraft("");
    setSlowModeRemaining(8);
    emitSocket("chat:send", { courseId, message });
  };

  const moderateMessage = (messageId: string, action: "pin" | "mute" | "remove") => {
    setMessages((current) =>
      current.map((message) => {
        if (action === "pin") return { ...message, pinned: message.id === messageId };
        if (message.id !== messageId) return message;
        if (action === "remove") return { ...message, body: "", removed: true, pinned: false };
        return { ...message, muted: true };
      }),
    );
    emitSocket(`chat:${action}`, { courseId, messageId });
  };

  const startCall = async () => {
    setCallActive(true);
    setCallDisconnected(false);
    emitSocket("call:start", { courseId });

    try {
      const response = await fetch(`/api/courses/${courseId}/live-session/livekit-token`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (response.ok) {
        const credentials = (await response.json()) as LiveKitCredentials;
        if (credentials.serverUrl && credentials.token) {
          setLiveKitCredentials(credentials);
        }
      }
    } catch {
      setLiveKitCredentials(null);
    }
  };

  const endCall = () => {
    setCallActive(false);
    setCallDisconnected(false);
    setLiveKitCredentials(null);
    emitSocket("call:end", { courseId });
  };

  const toggleMic = (participantId: string) => {
    if (micOptedOut && participantId === "student-1") return;

    setParticipants((current) =>
      current.map((participant) =>
        participant.id === participantId
          ? { ...participant, micEnabled: !participant.micEnabled }
          : participant,
      ),
    );
    emitSocket("call:mic-toggle", { courseId, participantId });
  };

  const raiseHand = () => {
    const hand = {
      id: user?.id ?? "student-1",
      name: user?.email?.split("@")[0] ?? "Student",
    };

    setRaisedHands((current) =>
      current.some((queued) => queued.id === hand.id) ? current : [...current, hand],
    );
    emitSocket("hand:raise", { courseId, ...hand });
  };

  const allowToSpeak = (hand: RaisedHand) => {
    setRaisedHands((current) => current.filter((queued) => queued.id !== hand.id));
    setParticipants((current) =>
      current.map((participant) =>
        participant.name === hand.name || participant.id === hand.id
          ? { ...participant, canSpeak: true, micEnabled: true }
          : participant,
      ),
    );
    emitSocket("hand:grant-mic", { courseId, participantId: hand.id });
  };

  const handleLiveKitDisconnected = () => {
    setCallDisconnected(true);
    setReconnectRemaining(30);
  };

  const rejoinCall = () => {
    setCallDisconnected(false);
    setReconnectRemaining(30);
    void startCall();
  };

  const optOutAudio = async () => {
    setConsentSubmitting(true);

    try {
      await fetch(`/api/courses/${courseId}/live-session/recording/opt-out`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ audio: false }),
      });
    } finally {
      setConsentSubmitting(false);
      setNeedsRecordingConsent(false);
      setMicOptedOut(true);
      setParticipants((current) =>
        current.map((participant) =>
          participant.id === "student-1" ? { ...participant, micEnabled: false, canSpeak: false } : participant,
        ),
      );
      emitSocket("recording:audio-opt-out", { courseId });
    }
  };

  const forceRecordingStarted = () => {
    setRecording(true);
    setNeedsRecordingConsent(true);
    emitSocket("rec:started", { courseId });
  };

  return (
    <div className="space-y-4">
      <RecBadge recording={recording} />
      <RecordingConsentModal
        open={needsRecordingConsent}
        isSubmitting={consentSubmitting}
        onContinue={() => setNeedsRecordingConsent(false)}
        onOptOut={optOutAudio}
      />

      {socketState !== "connected" && (
        <div className="sticky top-3 z-20 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 shadow-sm">
          You are offline - real-time features are unavailable.
          {socketState === "reconnecting" && <span className="ml-2">Reconnecting...</span>}
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Live Session</h2>
            <p className="text-sm text-slate-600">Chat, call, and recording controls for this class.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {socketState === "reconnecting" && (
              <span className="rounded bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                Reconnecting...
              </span>
            )}
            {recording ? (
              <span className="rounded bg-red-100 px-2.5 py-1 text-xs font-bold uppercase text-red-700">
                Recording active
              </span>
            ) : (
              isTeacher && (
                <button
                  type="button"
                  onClick={forceRecordingStarted}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Simulate rec:started
                </button>
              )
            )}
            {isTeacher && !callActive && (
              <button
                type="button"
                onClick={startCall}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Start Call
              </button>
            )}
            {callActive && (
              <button
                type="button"
                onClick={endCall}
                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                End Call
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="relative min-h-[520px] border-b border-slate-200 p-4 xl:border-b-0 xl:border-r">
            {callDisconnected && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 p-4 text-center text-white">
                <div className="rounded-lg bg-slate-950 px-6 py-5 shadow-xl">
                  <p className="font-semibold">Call disconnected - attempting to reconnect...</p>
                  {reconnectRemaining > 0 ? (
                    <p className="mt-2 text-sm text-slate-300">{reconnectRemaining}s remaining</p>
                  ) : (
                    <button
                      type="button"
                      onClick={rejoinCall}
                      className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100"
                    >
                      Rejoin Call
                    </button>
                  )}
                </div>
              </div>
            )}

            {callActive ? (
              liveKitCredentials ? (
                <LiveKitRoom
                  audio={!micOptedOut}
                  video
                  connect
                  token={liveKitCredentials.token}
                  serverUrl={liveKitCredentials.serverUrl}
                  onDisconnected={handleLiveKitDisconnected}
                  className="space-y-4"
                >
                  <LiveKitGrid />
                  <ControlBar
                    controls={{
                      microphone: !micOptedOut,
                      camera: true,
                      screenShare: isTeacher,
                      chat: false,
                      leave: false,
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  />
                </LiveKitRoom>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {participants.map((participant) => (
                    <DemoParticipantTile
                      key={participant.id}
                      participant={participant}
                      isTeacher={isTeacher}
                      onToggleMic={toggleMic}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {isTeacher ? "Ready to start the voice call" : "Waiting for the teacher to start the call"}
                  </h3>
                  <p className="mt-2 max-w-md text-sm text-slate-600">
                    Participants, connection quality, hand raises, and mute controls will appear here.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_280px]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Participants</h3>
                  {!isTeacher && (
                    <button
                      type="button"
                      onClick={raiseHand}
                      className="rounded-lg border border-brand-600 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      Raise hand
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {participants.map((participant) => (
                    <div key={participant.id} className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{participant.name}</p>
                        <p className="text-xs capitalize text-slate-500">
                          {participant.role} · {participant.micEnabled ? "mic on" : "muted"}
                        </p>
                      </div>
                      <QualityIndicator quality={participant.quality} />
                    </div>
                  ))}
                </div>
              </div>

              {isTeacher && (
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <h3 className="text-sm font-semibold text-slate-900">Raised hands</h3>
                  <div className="mt-3 space-y-2">
                    {raisedHands.length === 0 ? (
                      <p className="text-sm text-slate-500">No students waiting.</p>
                    ) : (
                      raisedHands.map((hand) => (
                        <div key={hand.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2">
                          <span className="truncate text-sm font-medium text-slate-900">{hand.name}</span>
                          <button
                            type="button"
                            onClick={() => allowToSpeak(hand)}
                            className="shrink-0 rounded bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                          >
                            Allow to speak
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="flex min-h-[620px] flex-col">
            {pinnedMessages.length > 0 && (
              <div className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Pinned</p>
                <div className="mt-1 space-y-1">
                  {pinnedMessages.map((message) => (
                    <p key={message.id} className="line-clamp-2 text-sm text-amber-950">
                      {message.body}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div
              ref={messageListRef}
              onScroll={handleMessageScroll}
              className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
            >
              {messages.map((message) => (
                <article key={message.id} className="group flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                    {message.avatar}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-950">{message.senderName}</span>
                      <RoleBadge role={message.senderRole} />
                      <span className="text-xs text-slate-500">{formatRelativeTime(message.sentAt)}</span>
                    </div>
                    <p className={`mt-1 text-sm leading-6 ${message.removed ? "italic text-slate-500" : "text-slate-700"}`}>
                      {message.removed ? "[Removed]" : message.body}
                    </p>
                    {isTeacher && (
                      <div className="mt-2 flex flex-wrap gap-1.5 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => moderateMessage(message.id, "pin")}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Pin
                        </button>
                        <button
                          type="button"
                          onClick={() => moderateMessage(message.id, "mute")}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Mute
                        </button>
                        <button
                          type="button"
                          onClick={() => moderateMessage(message.id, "remove")}
                          className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="border-t border-slate-200 p-4">
              {sessionEnded && (
                <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                  Session has ended - chat is now locked.
                  {redirectRemaining !== null && (
                    <span className="ml-1 text-slate-500">
                      Redirecting to async discussion in {redirectRemaining}s.
                    </span>
                  )}
                </div>
              )}
              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  disabled={sessionEnded}
                  placeholder={sessionEnded ? "Chat locked" : "Message the session"}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100"
                />
                <button
                  type="submit"
                  disabled={sessionEnded || slowModeRemaining > 0 || !messageDraft.trim()}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Send
                  {slowModeRemaining > 0 && <span className="ml-2 tabular-nums">{slowModeRemaining}s</span>}
                </button>
              </form>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
