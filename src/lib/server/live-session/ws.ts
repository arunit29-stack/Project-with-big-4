import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../auth/jwt";
import { getRedisPublisher, getRedisSubscriber } from "../notifications/redis";
import {
  canJoinSession,
  getSession,
  getSlowModeSeconds,
  isStudentMuted,
  insertChatMessage,
  listSessionMessages,
  muteSessionStudent,
  pinSessionMessage,
  removeSessionMessage,
  setSlowMode,
  setSessionState,
} from "./service";

type AuthedSocket = Socket & { userId?: string; role?: "teacher" | "student" | "admin"; email?: string; name?: string };

type ChatEnvelope =
  | {
      type: "chat:message";
      payload: {
        messageId: string;
        senderId: string;
        senderName: string;
        senderRole: "teacher" | "student";
        body: string;
        timestamp: string;
        pinned?: boolean;
      };
    }
  | { type: "chat:pinned"; payload: { messageId: string } }
  | { type: "chat:removed"; payload: { messageId: string } }
  | { type: "chat:slow-mode"; payload: { seconds: number } }
  | { type: "session:ended"; payload: { sessionId: string } }
  | { type: "rec:started"; payload: { consentBanner: { title: string; body: string } } }
  | { type: "rec:stopped"; payload: {} };

function getSessionIdFromNamespace(namespace: string): string | null {
  const match = namespace.match(/^\/sessions\/([^/]+)\/chat$/);
  return match?.[1] ?? null;
}

function isChatOpen(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return false;
  if (session.state === "active") return true;
  if (session.state !== "ended" || !session.active_until) return false;
  return new Date(session.active_until).getTime() > Date.now();
}

const channelReferenceCounts = new Map<string, number>();

export async function publishLiveSessionEvent(sessionId: string, envelope: ChatEnvelope) {
  const pub = await getRedisPublisher();
  if (!pub) return;
  await pub.publish(`sessions:${sessionId}`, JSON.stringify(envelope));
}

export function attachLiveSessionSocketServer(io: Server): void {
  const nsp = io.of(/^\/sessions\/[^/]+\/chat$/);

  nsp.use(async (socket, next) => {
    try {
      const sessionId = getSessionIdFromNamespace(socket.nsp.name);
      if (!sessionId) return next(new Error("unauthorized"));
      const token =
        typeof socket.handshake.auth?.token === "string"
          ? socket.handshake.auth.token
          : typeof socket.handshake.query?.token === "string"
            ? socket.handshake.query.token
            : null;
      if (!token) return next(new Error("unauthorized"));
      const auth = await verifyAccessToken(token);
      const allowed = await canJoinSession(sessionId, auth.userId, auth.role === "teacher" ? "teacher" : "student");
      if (!allowed) return next(new Error("forbidden"));
      (socket as AuthedSocket).userId = auth.userId;
      (socket as AuthedSocket).role = auth.role;
      (socket as AuthedSocket).email = auth.email;
      (socket as AuthedSocket).name = auth.email.split("@")[0];
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  nsp.on("connection", async (socket) => {
    const sessionId = getSessionIdFromNamespace(socket.nsp.name);
    const authed = socket as AuthedSocket;
    if (!sessionId || !authed.userId) {
      socket.disconnect(true);
      return;
    }

    const session = await getSession(sessionId);
    if (!session) {
      socket.disconnect(true);
      return;
    }

    const sessionMessages = await listSessionMessages(sessionId);
    socket.emit(
      "chat:init",
      sessionMessages.map((message) => ({
        messageId: message.id,
        senderId: message.sender_id,
        senderName: message.sender_name,
        senderRole: message.sender_role,
        body: message.deleted_at ? "[Removed]" : message.body,
        timestamp: message.created_at,
        pinned: Boolean(message.pinned_at),
      })),
    );

    const sub = await getRedisSubscriber();
    const channel = `sessions:${sessionId}`;
    const handler = (message: string) => {
      const parsed = JSON.parse(message) as ChatEnvelope;
      socket.emit(parsed.type, parsed.payload);
    };
    if (sub) {
      const currentCount = channelReferenceCounts.get(channel) ?? 0;
      channelReferenceCounts.set(channel, currentCount + 1);
      if (currentCount === 0) {
        await sub.subscribe(channel, handler);
      }
    }

    socket.on("chat:send", async ({ message }: { message: string }) => {
      const currentSession = await getSession(sessionId);
      if (!isChatOpen(currentSession)) {
        socket.emit("chat:error", { status: 423, message: "Locked" });
        return;
      }
      if (await isStudentMuted(sessionId, authed.userId!)) {
        socket.emit("chat:error", { status: 429, message: "Muted" });
        return;
      }
      const slowSeconds = await getSlowModeSeconds(sessionId);
      if (slowSeconds > 0) {
        const redis = await getRedisPublisher();
        const slowKey = `slow:${sessionId}:${authed.userId}`;
        if (redis) {
          const blocked = await redis.get(slowKey);
          if (blocked) {
            socket.emit("chat:error", { status: 429, message: "Slow mode" });
            return;
          }
          await redis.set(slowKey, "1", { EX: slowSeconds });
        }
      }
      const body = String(message ?? "").trim();
      if (!body) return;
      const inserted = await insertChatMessage({
        sessionId,
        courseId: currentSession?.course_id ?? session.course_id,
        senderId: authed.userId!,
        senderName: authed.name ?? "Student",
        senderRole: authed.role === "teacher" ? "teacher" : "student",
        body,
      });
      await publishLiveSessionEvent(sessionId, {
        type: "chat:message",
        payload: {
          messageId: inserted.id,
          senderId: inserted.sender_id,
          senderName: inserted.sender_name,
          senderRole: inserted.sender_role === "teacher" ? "teacher" : "student",
          body: inserted.body,
          timestamp: inserted.created_at,
        },
      });
    });

    socket.on("chat:pin", async ({ messageId }: { messageId: string }) => {
      if (authed.role !== "teacher") return;
      if (await pinSessionMessage(sessionId, messageId)) {
        await publishLiveSessionEvent(sessionId, { type: "chat:pinned", payload: { messageId } });
      }
    });

    socket.on("chat:remove", async ({ messageId }: { messageId: string }) => {
      if (authed.role !== "teacher") return;
      if (await removeSessionMessage(sessionId, messageId)) {
        await publishLiveSessionEvent(sessionId, { type: "chat:removed", payload: { messageId } });
      }
    });

    socket.on("chat:slow-mode", async ({ enabled, intervalSeconds }: { enabled: boolean; intervalSeconds: number }) => {
      if (authed.role !== "teacher") return;
      const seconds = await setSlowMode(sessionId, enabled, intervalSeconds);
      await publishLiveSessionEvent(sessionId, { type: "chat:slow-mode", payload: { seconds } });
    });

    socket.on("call:start", async () => {
      if (authed.role !== "teacher") return;
      await setSessionState(sessionId, "active");
    });

    socket.on("call:end", async () => {
      if (authed.role !== "teacher") return;
      await setSessionState(sessionId, "ended");
      await publishLiveSessionEvent(sessionId, { type: "session:ended", payload: { sessionId } });
    });

    socket.on("hand:grant-mic", async ({ participantId }: { participantId: string }) => {
      if (authed.role !== "teacher") return;
      await publishLiveSessionEvent(sessionId, { type: "chat:message", payload: {
        messageId: `system-${Date.now()}`,
        senderId: "system",
        senderName: "System",
        senderRole: "teacher",
        body: `${participantId} has been granted mic access.`,
        timestamp: new Date().toISOString(),
      }});
    });

    socket.on("rec:started", async () => {
      if (authed.role !== "teacher") return;
      await publishLiveSessionEvent(sessionId, {
        type: "rec:started",
        payload: { consentBanner: { title: "Recording started", body: "By continuing, you consent to being recorded." } },
      });
    });

    socket.on("recording:audio-opt-out", async ({ studentId }: { studentId?: string }) => {
      if (studentId) {
        await muteSessionStudent(sessionId, studentId);
      }
    });

    socket.on("disconnect", async () => {
      if (sub) {
        const currentCount = channelReferenceCounts.get(channel) ?? 0;
        const nextCount = Math.max(0, currentCount - 1);
        if (nextCount === 0) {
          await sub.unsubscribe(channel);
          channelReferenceCounts.delete(channel);
        } else {
          channelReferenceCounts.set(channel, nextCount);
        }
      }
    });
  });
}
