"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachNotificationSocketServer = attachNotificationSocketServer;
exports.getNotificationSocketServer = getNotificationSocketServer;
const socket_io_1 = require("socket.io");
const jwt_1 = require("../auth/jwt");
const redis_1 = require("./redis");
const store_1 = require("./store");
const USER_SOCKET_PREFIX = "cbb:ws:user:";
const USER_SOCKET_TTL_SECONDS = 60 * 60;
let ioInstance = null;
const localSubscriptions = new Map(); // userId -> Redis channel
async function setSocketMapping(userId, socketId) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return;
    await redis.set(`${USER_SOCKET_PREFIX}${userId}`, socketId, {
        EX: USER_SOCKET_TTL_SECONDS,
    });
}
async function clearSocketMapping(userId, socketId) {
    const redis = await (0, redis_1.getRedisPublisher)();
    if (!redis)
        return;
    const key = `${USER_SOCKET_PREFIX}${userId}`;
    const current = await redis.get(key);
    if (current === socketId) {
        await redis.del(key);
    }
}
async function refreshSocketMapping(userId, socketId) {
    await setSocketMapping(userId, socketId);
}
async function subscribeUserChannel(userId) {
    if (localSubscriptions.has(userId))
        return;
    const subscriber = await (0, redis_1.getRedisSubscriber)();
    if (!subscriber)
        return;
    const channel = `notifications:${userId}`;
    await subscriber.subscribe(channel, async (message) => {
        var _a;
        const io = ioInstance;
        if (!io)
            return;
        const data = JSON.parse(message);
        const socketId = await ((_a = (await (0, redis_1.getRedisPublisher)())) === null || _a === void 0 ? void 0 : _a.get(`${USER_SOCKET_PREFIX}${userId}`));
        if (!socketId)
            return;
        io.to(socketId).emit("notification", data);
        const unreadCount = await (0, store_1.countUnreadNotifications)(userId);
        io.to(socketId).emit("unread_count", { type: "unread_count", unreadCount });
    });
    localSubscriptions.set(userId, channel);
}
async function unsubscribeUserChannel(userId) {
    const channel = localSubscriptions.get(userId);
    if (!channel)
        return;
    const subscriber = await (0, redis_1.getRedisSubscriber)();
    if (subscriber) {
        await subscriber.unsubscribe(channel);
    }
    localSubscriptions.delete(userId);
}
async function attachNotificationSocketServer(server) {
    if (ioInstance)
        return ioInstance;
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: true,
            credentials: true,
        },
        path: "/socket.io",
    });
    ioInstance = io;
    io.use(async (socket, next) => {
        var _a, _b;
        try {
            const token = typeof ((_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.token) === "string"
                ? socket.handshake.auth.token
                : typeof ((_b = socket.handshake.query) === null || _b === void 0 ? void 0 : _b.token) === "string"
                    ? socket.handshake.query.token
                    : null;
            if (!token) {
                return next(new Error("unauthorized"));
            }
            const auth = await (0, jwt_1.verifyAccessToken)(token);
            socket.userId = auth.userId;
            socket.data.auth = auth;
            return next();
        }
        catch (_c) {
            return next(new Error("unauthorized"));
        }
    });
    io.on("connection", async (socket) => {
        const attached = socket;
        const userId = attached.userId;
        if (!userId) {
            socket.disconnect(true);
            return;
        }
        await setSocketMapping(userId, socket.id);
        await subscribeUserChannel(userId);
        const unreadCount = await (0, store_1.countUnreadNotifications)(userId);
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
function getNotificationSocketServer() {
    return ioInstance;
}
