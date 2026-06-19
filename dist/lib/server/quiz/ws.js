"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishQuizEvent = publishQuizEvent;
exports.attachQuizSocketServer = attachQuizSocketServer;
const jwt_1 = require("../auth/jwt");
const redis_1 = require("../notifications/redis");
const redis_state_1 = require("./redis-state");
const quizChannelReferenceCounts = new Map();
async function publishQuizEvent(quizId, payload) {
    const pub = await (0, redis_1.getRedisPublisher)();
    if (!pub)
        return;
    await pub.publish(`quiz:${quizId}:broadcast`, JSON.stringify(payload));
}
function attachQuizSocketServer(io) {
    const nsp = io.of(/^\/quizzes\/[^/]+$/);
    nsp.use(async (socket, next) => {
        var _a, _b;
        try {
            const match = socket.nsp.name.match(/^\/quizzes\/([^/]+)$/);
            const quizId = match === null || match === void 0 ? void 0 : match[1];
            if (!quizId)
                return next(new Error("invalid_quiz"));
            const token = typeof ((_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.token) === "string"
                ? socket.handshake.auth.token
                : typeof ((_b = socket.handshake.query) === null || _b === void 0 ? void 0 : _b.token) === "string"
                    ? socket.handshake.query.token
                    : null;
            if (!token)
                return next(new Error("unauthorized"));
            const auth = await (0, jwt_1.verifyAccessToken)(token);
            socket.userId = auth.userId;
            socket.role = auth.role;
            socket.email = auth.email;
            return next();
        }
        catch (_c) {
            return next(new Error("unauthorized"));
        }
    });
    nsp.on("connection", async (socket) => {
        var _a;
        const match = socket.nsp.name.match(/^\/quizzes\/([^/]+)$/);
        const quizId = match === null || match === void 0 ? void 0 : match[1];
        const authed = socket;
        if (!quizId || !authed.userId) {
            socket.disconnect(true);
            return;
        }
        const channel = `quiz:${quizId}:broadcast`;
        // Subscribe to Redis Pub/Sub channel if not already subscribed
        const sub = await (0, redis_1.getRedisSubscriber)();
        const handler = (message) => {
            try {
                const parsed = JSON.parse(message);
                if (parsed.type === "student_joined") {
                    // Broadcast student_joined event to all connected sockets in this namespace
                    socket.nsp.emit("quiz:student_joined", parsed.payload);
                }
                else if (parsed.type === "question") {
                    socket.nsp.emit("quiz:question", parsed.payload);
                }
                else if (parsed.type === "lobby_update") {
                    socket.nsp.emit("quiz:lobby_update", parsed.payload);
                }
                else if (parsed.type === "quiz_ended") {
                    socket.nsp.emit("quiz:quiz_ended", parsed.payload);
                }
                else {
                    socket.nsp.emit(parsed.type, parsed.payload);
                }
            }
            catch (err) {
                console.error("Error parsing Pub/Sub message", err);
            }
        };
        if (sub) {
            const currentCount = (_a = quizChannelReferenceCounts.get(channel)) !== null && _a !== void 0 ? _a : 0;
            quizChannelReferenceCounts.set(channel, currentCount + 1);
            if (currentCount === 0) {
                await sub.subscribe(channel, handler);
            }
        }
        // If it's a student joining, add them to lobby and trigger event
        if (authed.role === "student") {
            await (0, redis_state_1.addLobbyStudent)(quizId, authed.userId, authed.email || "");
            await publishQuizEvent(quizId, {
                type: "student_joined",
                payload: { userId: authed.userId, email: authed.email },
            });
        }
        socket.on("disconnect", async () => {
            var _a;
            if (sub) {
                const currentCount = (_a = quizChannelReferenceCounts.get(channel)) !== null && _a !== void 0 ? _a : 0;
                const nextCount = Math.max(0, currentCount - 1);
                if (nextCount === 0) {
                    await sub.unsubscribe(channel);
                    quizChannelReferenceCounts.delete(channel);
                }
                else {
                    quizChannelReferenceCounts.set(channel, nextCount);
                }
            }
        });
    });
}
