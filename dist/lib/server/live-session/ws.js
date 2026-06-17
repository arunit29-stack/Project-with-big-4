"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishLiveSessionEvent = publishLiveSessionEvent;
exports.attachLiveSessionSocketServer = attachLiveSessionSocketServer;
const jwt_1 = require("../auth/jwt");
const redis_1 = require("../notifications/redis");
const service_1 = require("./service");
function getSessionIdFromNamespace(namespace) {
    var _a;
    const match = namespace.match(/^\/sessions\/([^/]+)\/chat$/);
    return (_a = match === null || match === void 0 ? void 0 : match[1]) !== null && _a !== void 0 ? _a : null;
}
function isChatOpen(session) {
    if (!session)
        return false;
    if (session.state === "active")
        return true;
    if (session.state !== "ended" || !session.active_until)
        return false;
    return new Date(session.active_until).getTime() > Date.now();
}
const channelReferenceCounts = new Map();
async function publishLiveSessionEvent(sessionId, envelope) {
    const pub = await (0, redis_1.getRedisPublisher)();
    if (!pub)
        return;
    await pub.publish(`sessions:${sessionId}`, JSON.stringify(envelope));
}
function attachLiveSessionSocketServer(io) {
    const nsp = io.of(/^\/sessions\/[^/]+\/chat$/);
    nsp.use(async (socket, next) => {
        var _a, _b;
        try {
            const sessionId = getSessionIdFromNamespace(socket.nsp.name);
            if (!sessionId)
                return next(new Error("unauthorized"));
            const token = typeof ((_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.token) === "string"
                ? socket.handshake.auth.token
                : typeof ((_b = socket.handshake.query) === null || _b === void 0 ? void 0 : _b.token) === "string"
                    ? socket.handshake.query.token
                    : null;
            if (!token)
                return next(new Error("unauthorized"));
            const auth = await (0, jwt_1.verifyAccessToken)(token);
            const allowed = await (0, service_1.canJoinSession)(sessionId, auth.userId, auth.role === "teacher" ? "teacher" : "student");
            if (!allowed)
                return next(new Error("forbidden"));
            socket.userId = auth.userId;
            socket.role = auth.role;
            socket.email = auth.email;
            socket.name = auth.email.split("@")[0];
            return next();
        }
        catch (_c) {
            return next(new Error("unauthorized"));
        }
    });
    nsp.on("connection", async (socket) => {
        var _a;
        const sessionId = getSessionIdFromNamespace(socket.nsp.name);
        const authed = socket;
        if (!sessionId || !authed.userId) {
            socket.disconnect(true);
            return;
        }
        const session = await (0, service_1.getSession)(sessionId);
        if (!session) {
            socket.disconnect(true);
            return;
        }
        const sessionMessages = await (0, service_1.listSessionMessages)(sessionId);
        socket.emit("chat:init", sessionMessages.map((message) => ({
            messageId: message.id,
            senderId: message.sender_id,
            senderName: message.sender_name,
            senderRole: message.sender_role,
            body: message.deleted_at ? "[Removed]" : message.body,
            timestamp: message.created_at,
            pinned: Boolean(message.pinned_at),
        })));
        const sub = await (0, redis_1.getRedisSubscriber)();
        const channel = `sessions:${sessionId}`;
        const handler = (message) => {
            const parsed = JSON.parse(message);
            socket.emit(parsed.type, parsed.payload);
        };
        if (sub) {
            const currentCount = (_a = channelReferenceCounts.get(channel)) !== null && _a !== void 0 ? _a : 0;
            channelReferenceCounts.set(channel, currentCount + 1);
            if (currentCount === 0) {
                await sub.subscribe(channel, handler);
            }
        }
        socket.on("chat:send", async ({ message }) => {
            var _a, _b;
            const currentSession = await (0, service_1.getSession)(sessionId);
            if (!isChatOpen(currentSession)) {
                socket.emit("chat:error", { status: 423, message: "Locked" });
                return;
            }
            if (await (0, service_1.isStudentMuted)(sessionId, authed.userId)) {
                socket.emit("chat:error", { status: 429, message: "Muted" });
                return;
            }
            const slowSeconds = await (0, service_1.getSlowModeSeconds)(sessionId);
            if (slowSeconds > 0) {
                const redis = await (0, redis_1.getRedisPublisher)();
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
            const body = String(message !== null && message !== void 0 ? message : "").trim();
            if (!body)
                return;
            const inserted = await (0, service_1.insertChatMessage)({
                sessionId,
                courseId: (_a = currentSession === null || currentSession === void 0 ? void 0 : currentSession.course_id) !== null && _a !== void 0 ? _a : session.course_id,
                senderId: authed.userId,
                senderName: (_b = authed.name) !== null && _b !== void 0 ? _b : "Student",
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
        socket.on("chat:pin", async ({ messageId }) => {
            if (authed.role !== "teacher")
                return;
            if (await (0, service_1.pinSessionMessage)(sessionId, messageId)) {
                await publishLiveSessionEvent(sessionId, { type: "chat:pinned", payload: { messageId } });
            }
        });
        socket.on("chat:remove", async ({ messageId }) => {
            if (authed.role !== "teacher")
                return;
            if (await (0, service_1.removeSessionMessage)(sessionId, messageId)) {
                await publishLiveSessionEvent(sessionId, { type: "chat:removed", payload: { messageId } });
            }
        });
        socket.on("chat:slow-mode", async ({ enabled, intervalSeconds }) => {
            if (authed.role !== "teacher")
                return;
            const seconds = await (0, service_1.setSlowMode)(sessionId, enabled, intervalSeconds);
            await publishLiveSessionEvent(sessionId, { type: "chat:slow-mode", payload: { seconds } });
        });
        socket.on("call:start", async () => {
            if (authed.role !== "teacher")
                return;
            await (0, service_1.setSessionState)(sessionId, "active");
        });
        socket.on("call:end", async () => {
            if (authed.role !== "teacher")
                return;
            await (0, service_1.setSessionState)(sessionId, "ended");
            await publishLiveSessionEvent(sessionId, { type: "session:ended", payload: { sessionId } });
        });
        socket.on("hand:grant-mic", async ({ participantId }) => {
            if (authed.role !== "teacher")
                return;
            await publishLiveSessionEvent(sessionId, { type: "chat:message", payload: {
                    messageId: `system-${Date.now()}`,
                    senderId: "system",
                    senderName: "System",
                    senderRole: "teacher",
                    body: `${participantId} has been granted mic access.`,
                    timestamp: new Date().toISOString(),
                } });
        });
        socket.on("rec:started", async () => {
            if (authed.role !== "teacher")
                return;
            await publishLiveSessionEvent(sessionId, {
                type: "rec:started",
                payload: { consentBanner: { title: "Recording started", body: "By continuing, you consent to being recorded." } },
            });
        });
        socket.on("recording:audio-opt-out", async ({ studentId }) => {
            if (studentId) {
                await (0, service_1.muteSessionStudent)(sessionId, studentId);
            }
        });
        socket.on("disconnect", async () => {
            var _a;
            if (sub) {
                const currentCount = (_a = channelReferenceCounts.get(channel)) !== null && _a !== void 0 ? _a : 0;
                const nextCount = Math.max(0, currentCount - 1);
                if (nextCount === 0) {
                    await sub.unsubscribe(channel);
                    channelReferenceCounts.delete(channel);
                }
                else {
                    channelReferenceCounts.set(channel, nextCount);
                }
            }
        });
    });
}
