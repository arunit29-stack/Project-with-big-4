/* eslint-disable */
import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../auth/jwt";
import { getRedisPublisher, getRedisSubscriber } from "../notifications/redis";
import { addLobbyStudent } from "./redis-state";

type AuthedSocket = Socket & {
  userId?: string;
  role?: "teacher" | "student" | "admin";
  email?: string;
};

const quizChannelReferenceCounts = new Map<string, number>();

export async function publishQuizEvent(quizId: string, payload: any) {
  const pub = await getRedisPublisher();
  if (!pub) return;
  await pub.publish(`quiz:${quizId}:broadcast`, JSON.stringify(payload));
}

export function attachQuizSocketServer(io: Server): void {
  const nsp = io.of(/^\/quizzes\/[^/]+$/);

  nsp.use(async (socket, next) => {
    try {
      const match = socket.nsp.name.match(/^\/quizzes\/([^/]+)$/);
      const quizId = match?.[1];
      if (!quizId) return next(new Error("invalid_quiz"));

      const token =
        typeof socket.handshake.auth?.token === "string"
          ? socket.handshake.auth.token
          : typeof socket.handshake.query?.token === "string"
            ? socket.handshake.query.token
            : null;
      if (!token) return next(new Error("unauthorized"));

      const auth = await verifyAccessToken(token);
      (socket as AuthedSocket).userId = auth.userId;
      (socket as AuthedSocket).role = auth.role;
      (socket as AuthedSocket).email = auth.email;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  nsp.on("connection", async (socket) => {
    const match = socket.nsp.name.match(/^\/quizzes\/([^/]+)$/);
    const quizId = match?.[1];
    const authed = socket as AuthedSocket;

    if (!quizId || !authed.userId) {
      socket.disconnect(true);
      return;
    }

    const channel = `quiz:${quizId}:broadcast`;

    // Subscribe to Redis Pub/Sub channel if not already subscribed
    const sub = await getRedisSubscriber();
    const handler = (message: string) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === "student_joined") {
          // Broadcast student_joined event to all connected sockets in this namespace
          socket.nsp.emit("quiz:student_joined", parsed.payload);
        } else if (parsed.type === "question") {
          socket.nsp.emit("quiz:question", parsed.payload);
        } else if (parsed.type === "lobby_update") {
          socket.nsp.emit("quiz:lobby_update", parsed.payload);
        } else if (parsed.type === "quiz_ended") {
          socket.nsp.emit("quiz:quiz_ended", parsed.payload);
        } else {
          socket.nsp.emit(parsed.type, parsed.payload);
        }
      } catch (err) {
        console.error("Error parsing Pub/Sub message", err);
      }
    };

    if (sub) {
      const currentCount = quizChannelReferenceCounts.get(channel) ?? 0;
      quizChannelReferenceCounts.set(channel, currentCount + 1);
      if (currentCount === 0) {
        await sub.subscribe(channel, handler);
      }
    }

    // If it's a student joining, add them to lobby and trigger event
    if (authed.role === "student") {
      await addLobbyStudent(quizId, authed.userId, authed.email || "");
      await publishQuizEvent(quizId, {
        type: "student_joined",
        payload: { userId: authed.userId, email: authed.email },
      });
    }

    socket.on("disconnect", async () => {
      if (sub) {
        const currentCount = quizChannelReferenceCounts.get(channel) ?? 0;
        const nextCount = Math.max(0, currentCount - 1);
        if (nextCount === 0) {
          await sub.unsubscribe(channel);
          quizChannelReferenceCounts.delete(channel);
        } else {
          quizChannelReferenceCounts.set(channel, nextCount);
        }
      }
    });
  });
}
