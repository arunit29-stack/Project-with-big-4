"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLiveSessionRoutes = registerLiveSessionRoutes;
const fastify_1 = require("../../lib/server/auth/fastify");
const livekit_1 = require("../../lib/server/live-session/livekit");
const service_1 = require("../../lib/server/live-session/service");
const ws_1 = require("../../lib/server/live-session/ws");
const courseStore_1 = require("../../lib/api/courseStore");
function teacherOwnsCourse(courseId) {
    return Boolean((0, courseStore_1.getCourseDetail)(courseId, "teacher") || (0, courseStore_1.getCourseDetail)(courseId, "admin"));
}
function studentHasCourse(courseId) {
    return (0, courseStore_1.getStudentCourses)().some((course) => course.id === courseId);
}
function isAuthorizedForCourse(courseId, role) {
    return role === "teacher" ? teacherOwnsCourse(courseId) : studentHasCourse(courseId);
}
async function assertSessionAccess(sessionId, role) {
    const session = await (0, service_1.getSession)(sessionId);
    if (!session)
        return null;
    const courseId = session.course_id;
    if (!isAuthorizedForCourse(courseId, role))
        return null;
    return session;
}
async function registerLiveSessionRoutes(app) {
    app.post("/courses/:courseId/sessions", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { courseId } = request.params;
        const body = request.body;
        if (!teacherOwnsCourse(courseId)) {
            return reply.code(403).send({ error: "forbidden" });
        }
        const session = await (0, service_1.createSession)({
            courseId,
            teacherId: request.auth.userId,
            windDownMinutes: body === null || body === void 0 ? void 0 : body.wind_down_minutes,
        });
        return reply.send({ sessionId: session.id, state: session.state, windDownMinutes: session.wind_down_minutes });
    });
    app.post("/sessions/:sessionId/call/token", { preHandler: (0, fastify_1.requireAuth)(["teacher", "student"]) }, async (request, reply) => {
        const { sessionId } = request.params;
        const session = await assertSessionAccess(sessionId, request.auth.role === "teacher" ? "teacher" : "student");
        if (!session)
            return reply.code(404).send({ error: "not_found" });
        const canPublish = request.auth.role === "teacher" || !(await (0, service_1.isStudentMuted)(sessionId, request.auth.userId));
        const token = await (0, livekit_1.createLiveKitToken)({
            sessionId,
            userId: request.auth.userId,
            name: request.auth.email,
            role: request.auth.role === "teacher" ? "teacher" : "student",
            canPublish,
        });
        return reply.send(token);
    });
    app.post("/sessions/:sessionId/call/grant-mic/:studentId", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { sessionId, studentId } = request.params;
        const session = await assertSessionAccess(sessionId, "teacher");
        if (!session)
            return reply.code(404).send({ error: "not_found" });
        const token = await (0, livekit_1.createLiveKitToken)({
            sessionId,
            userId: studentId,
            name: studentId,
            role: "student",
            canPublish: true,
        });
        return reply.send(token);
    });
    app.post("/sessions/:sessionId/call/record/start", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { sessionId } = request.params;
        const session = await assertSessionAccess(sessionId, "teacher");
        if (!session)
            return reply.code(404).send({ error: "not_found" });
        await (0, ws_1.publishLiveSessionEvent)(sessionId, {
            type: "rec:started",
            payload: { consentBanner: { title: "Recording started", body: "By continuing, you consent to being recorded." } },
        });
        return reply.send({ ok: true });
    });
    app.post("/sessions/:sessionId/call/record/stop", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { sessionId } = request.params;
        const session = await assertSessionAccess(sessionId, "teacher");
        if (!session)
            return reply.code(404).send({ error: "not_found" });
        await (0, ws_1.publishLiveSessionEvent)(sessionId, { type: "rec:stopped", payload: {} });
        return reply.send({ ok: true });
    });
    app.post("/sessions/:sessionId/call/opt-out", { preHandler: (0, fastify_1.requireAuth)(["student"]) }, async (request, reply) => {
        const { sessionId } = request.params;
        const session = await assertSessionAccess(sessionId, "student");
        if (!session)
            return reply.code(404).send({ error: "not_found" });
        await (0, service_1.muteSessionStudent)(sessionId, request.auth.userId);
        return reply.send({ ok: true });
    });
    app.post("/sessions/:sessionId/messages/:messageId/pin", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { sessionId, messageId } = request.params;
        const session = await assertSessionAccess(sessionId, "teacher");
        if (!session)
            return reply.code(404).send({ error: "not_found" });
        const ok = await (0, service_1.pinSessionMessage)(sessionId, messageId);
        if (!ok)
            return reply.code(404).send({ error: "not_found" });
        await (0, ws_1.publishLiveSessionEvent)(sessionId, { type: "chat:pinned", payload: { messageId } });
        return reply.send({ ok: true });
    });
    app.delete("/sessions/:sessionId/messages/:messageId", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { sessionId, messageId } = request.params;
        const session = await assertSessionAccess(sessionId, "teacher");
        if (!session)
            return reply.code(404).send({ error: "not_found" });
        const ok = await (0, service_1.removeSessionMessage)(sessionId, messageId);
        if (!ok)
            return reply.code(404).send({ error: "not_found" });
        await (0, ws_1.publishLiveSessionEvent)(sessionId, { type: "chat:removed", payload: { messageId } });
        return reply.send({ ok: true });
    });
    app.post("/sessions/:sessionId/students/:studentId/mute", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { sessionId, studentId } = request.params;
        const session = await assertSessionAccess(sessionId, "teacher");
        if (!session)
            return reply.code(404).send({ error: "not_found" });
        await (0, service_1.muteSessionStudent)(sessionId, studentId);
        return reply.send({ ok: true });
    });
    app.post("/sessions/:sessionId/slow-mode", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        var _a;
        const { sessionId } = request.params;
        const session = await assertSessionAccess(sessionId, "teacher");
        if (!session)
            return reply.code(404).send({ error: "not_found" });
        const body = request.body;
        const enabled = Boolean(body === null || body === void 0 ? void 0 : body.enabled);
        const intervalSeconds = Math.min(30, Math.max(1, Number((_a = body === null || body === void 0 ? void 0 : body.intervalSeconds) !== null && _a !== void 0 ? _a : 30)));
        const seconds = await (0, service_1.setSlowMode)(sessionId, enabled, intervalSeconds);
        await (0, ws_1.publishLiveSessionEvent)(sessionId, { type: "chat:slow-mode", payload: { seconds } });
        return reply.send({ ok: true, seconds });
    });
    app.get("/courses/:courseId/dm", { preHandler: (0, fastify_1.requireAuth)(["student"]) }, async (request, reply) => {
        const { courseId } = request.params;
        if (!studentHasCourse(courseId))
            return reply.code(403).send({ error: "forbidden" });
        return reply.send({ thread: await (0, service_1.listDmThread)({ courseId, studentId: request.auth.userId }) });
    });
    app.post("/courses/:courseId/dm", { preHandler: (0, fastify_1.requireAuth)(["student"]) }, async (request, reply) => {
        const { courseId } = request.params;
        if (!studentHasCourse(courseId))
            return reply.code(403).send({ error: "forbidden" });
        const body = request.body;
        if (!(body === null || body === void 0 ? void 0 : body.type))
            return reply.code(400).send({ error: "invalid" });
        await (0, service_1.saveDm)({
            courseId,
            studentId: request.auth.userId,
            senderId: request.auth.userId,
            senderRole: "student",
            messageType: body.type,
            body: body.body,
            fileKey: body.fileKey,
        });
        return reply.send({ ok: true });
    });
    app.get("/courses/:courseId/dm/:studentId", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { courseId, studentId } = request.params;
        if (!teacherOwnsCourse(courseId))
            return reply.code(403).send({ error: "forbidden" });
        return reply.send({ thread: await (0, service_1.listDmThread)({ courseId, studentId }) });
    });
    app.post("/courses/:courseId/dm/:studentId", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { courseId, studentId } = request.params;
        if (!teacherOwnsCourse(courseId))
            return reply.code(403).send({ error: "forbidden" });
        const body = request.body;
        if (!(body === null || body === void 0 ? void 0 : body.type))
            return reply.code(400).send({ error: "invalid" });
        await (0, service_1.saveDm)({
            courseId,
            studentId,
            senderId: request.auth.userId,
            senderRole: "teacher",
            messageType: body.type,
            body: body.body,
            fileKey: body.fileKey,
        });
        return reply.send({ ok: true });
    });
    app.post("/courses/:courseId/live-session/livekit-token", { preHandler: (0, fastify_1.requireAuth)(["teacher", "student"]) }, async (request, reply) => {
        var _a;
        const { courseId } = request.params;
        const session = await (0, service_1.getLatestSessionForCourse)(courseId);
        if (!session && !isAuthorizedForCourse(courseId, request.auth.role === "teacher" ? "teacher" : "student")) {
            return reply.code(403).send({ error: "forbidden" });
        }
        const token = await (0, livekit_1.createLiveKitToken)({
            sessionId: (_a = session === null || session === void 0 ? void 0 : session.id) !== null && _a !== void 0 ? _a : courseId,
            userId: request.auth.userId,
            name: request.auth.email,
            role: request.auth.role === "teacher" ? "teacher" : "student",
            canPublish: request.auth.role === "teacher",
        });
        return reply.send(token);
    });
    app.post("/courses/:courseId/live-session/recording/opt-out", { preHandler: (0, fastify_1.requireAuth)(["student"]) }, async (request, reply) => {
        const { courseId } = request.params;
        if (!studentHasCourse(courseId))
            return reply.code(403).send({ error: "forbidden" });
        const session = await (0, service_1.getLatestSessionForCourse)(courseId);
        if (session) {
            await (0, service_1.muteSessionStudent)(session.id, request.auth.userId);
        }
        return reply.send({ ok: true });
    });
}
