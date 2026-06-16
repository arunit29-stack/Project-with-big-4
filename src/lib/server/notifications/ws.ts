import { createServer } from "http";
import { Server, type Socket } from "socket.io";
import { verifyAccessToken } from "../auth/jwt";
import { getRedisPublisher, getRedisSubscriber } from "./redis";
import { countUnreadNotifications } from "./store";
import type { NotificationDTO } from "./types";

const USER_SOCKET_PREFIX = "cbb:ws:user:";
const USER_SOCKET_TTL_SECONDS = 60 * 60;

type AttachedSocket = Socket & { userId?: string };

let ioInstance: Server | null = null;
const localSubscriptions = new Map<string, string>(); // userId -> Redis channel

async function setSocketMapping(userId: string, socketId: string) {
  const redis = await getRedisPublisher();
  if (!redis) return;
  await redis.set(`${USER_SOCKET_PREFIX}${userId}`, socketId, {
    EX: USER_SOCKET_TTL_SECONDS,
  });
}

async function clearSocketMapping(userId: string, socketId: string) {
  const redis = await getRedisPublisher();
  if (!redis) return;
  const key = `${USER_SOCKET_PREFIX}${userId}`;
  const current = await redis.get(key);
  if (current === socketId) {
    await redis.del(key);
  }
}

async function refreshSocketMapping(userId: string, socketId: string) {
  await setSocketMapping(userId, socketId);
}

async function subscribeUserChannel(userId: string) {
  if (localSubscriptions.has(userId)) return;
  const subscriber = await getRedisSubscriber();
  if (!subscriber) return;
  const channel = `notifications:${userId}`;
  await subscriber.subscribe(channel, async (message) => {
    const io = ioInstance;
    if (!io) return;
    const data = JSON.parse(message) as NotificationDTO & { userId: string };
    const socketId = await (await getRedisPublisher())?.get(`${USER_SOCKET_PREFIX}${userId}`);
    if (!socketId) return;
    io.to(socketId).emit("notification", data);
    const unreadCount = await countUnreadNotifications(userId);
    io.to(socketId).emit("unread_count", { type: "unread_count", unreadCount });
  });
  localSubscriptions.set(userId, channel);
}

async function unsubscribeUserChannel(userId: string) {
  const channel = localSubscriptions.get(userId);
  if (!channel) return;
  const subscriber = await getRedisSubscriber();
  if (subscriber) {
    await subscriber.unsubscribe(channel);
  }
  localSubscriptions.delete(userId);
}

export async function attachNotificationSocketServer(server: ReturnType<typeof createServer>) {
  if (ioInstance) return ioInstance;

  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: "/socket.io",
  });
  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const token =
        typeof socket.handshake.auth?.token === "string"
          ? socket.handshake.auth.token
          : typeof socket.handshake.query?.token === "string"
            ? socket.handshake.query.token
            : null;
      if (!token) {
        return next(new Error("unauthorized"));
      }
      const auth = await verifyAccessToken(token);
      (socket as AttachedSocket).userId = auth.userId;
      socket.data.auth = auth;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const attached = socket as AttachedSocket;
    const userId = attached.userId;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    await setSocketMapping(userId, socket.id);
    await subscribeUserChannel(userId);
    const unreadCount = await countUnreadNotifications(userId);
    socket.emit("unread_count", { type: "unread_count", unreadCount });

    socket.on("activity", async () => {
      await refreshSocketMapping(userId, socket.id);
    });

    socket.on("disconnect", async () => {
      await clearSocketMapping(userId, socket.id);
      await unsubscribeUserChannel(userId);
    });
  });

  return io;
}

export function getNotificationSocketServer(): Server | null {
  return ioInstance;
}
