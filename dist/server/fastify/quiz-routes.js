"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerQuizRoutes = registerQuizRoutes;
const fastify_1 = require("../../lib/server/auth/fastify");
const courseStore_1 = require("../../lib/api/courseStore");
const service_1 = require("../../lib/server/quiz/service");
const coordinator_1 = require("../../lib/server/quiz/coordinator");
const redis_state_1 = require("../../lib/server/quiz/redis-state");
function teacherOwnsCourse(courseId) {
    return Boolean((0, courseStore_1.getCourseDetail)(courseId, "teacher") || (0, courseStore_1.getCourseDetail)(courseId, "admin"));
}
function studentHasCourse(courseId) {
    return (0, courseStore_1.getStudentCourses)().some((course) => course.id === courseId);
}
async function registerQuizRoutes(app) {
    // 1. Create Quiz (Teacher only)
    app.post("/courses/:courseId/quizzes", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { courseId } = request.params;
        if (!teacherOwnsCourse(courseId)) {
            return reply.code(403).send({ error: "forbidden" });
        }
        const body = request.body;
        if (!body.title || !Array.isArray(body.questions) || body.questions.length === 0) {
            return reply.code(400).send({ error: "invalid_payload" });
        }
        try {
            const quizId = await (0, service_1.createQuiz)(courseId, body);
            return reply.send({ quizId });
        }
        catch (err) {
            return reply.code(400).send({ error: err.message });
        }
    });
    // 2. Launch Lobby (Teacher only)
    app.post("/quizzes/:quizId/launch", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { quizId } = request.params;
        try {
            const lobbyEndsAt = await (0, coordinator_1.launchQuizLobby)(quizId);
            return reply.send({ status: "lobby", lobbyEndsAt });
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
    // 3. Extend Lobby (Teacher only)
    app.post("/quizzes/:quizId/lobby/extend", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { quizId } = request.params;
        try {
            const newEndsAt = await (0, coordinator_1.extendQuizLobby)(quizId);
            if (!newEndsAt) {
                return reply.code(400).send({ error: "lobby_not_active_or_max_extensions" });
            }
            return reply.send({ lobbyEndsAt: newEndsAt });
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
    // 4. Start Quiz immediately (Teacher only)
    app.post("/quizzes/:quizId/start", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { quizId } = request.params;
        try {
            await (0, coordinator_1.startQuiz)(quizId);
            return reply.send({ ok: true });
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
    // 5. Answer Submission (Student only)
    app.post("/quizzes/:quizId/attempts/:attemptId/answers", { preHandler: (0, fastify_1.requireAuth)(["student"]) }, async (request, reply) => {
        const { quizId, attemptId } = request.params;
        const body = request.body;
        if (!body.questionId || body.selectedOption === undefined || body.timeRemainingSeconds === undefined) {
            return reply.code(400).send({ error: "invalid_payload" });
        }
        const userId = request.auth.userId;
        const userAgent = request.headers["user-agent"] || "";
        const ip = request.ip;
        try {
            // Enforce active session constraints and write to integrity log if needed
            await (0, service_1.getOrCreateAttempt)(quizId, userId, attemptId, userAgent, ip);
            const result = await (0, service_1.saveAnswer)(quizId, attemptId, userId, body.questionId, body.selectedOption, body.timeRemainingSeconds, userAgent, ip);
            return reply.send(Object.assign({ ok: true }, result));
        }
        catch (err) {
            if (err.message === "duplicate_device") {
                return reply.code(409).send({ error: "duplicate_device" });
            }
            return reply.code(500).send({ error: err.message });
        }
    });
    // 6. Reconnect state retrieval (Student only)
    app.get("/quizzes/:quizId/attempts/:attemptId/state", { preHandler: (0, fastify_1.requireAuth)(["student"]) }, async (request, reply) => {
        const { quizId, attemptId } = request.params;
        const userId = request.auth.userId;
        const userAgent = request.headers["user-agent"] || "";
        const ip = request.ip;
        try {
            await (0, service_1.getOrCreateAttempt)(quizId, userId, attemptId, userAgent, ip);
            const state = await (0, redis_state_1.getQuizState)(quizId);
            if (!state) {
                return reply.code(404).send({ error: "quiz_not_active" });
            }
            let timeRemainingSeconds = 0;
            if (state.status === "lobby" && state.lobbyEndsAt) {
                timeRemainingSeconds = Math.max(0, Math.round((new Date(state.lobbyEndsAt).getTime() - Date.now()) / 1000));
            }
            else if (state.status === "active" && state.currentQuestionEndsAt) {
                timeRemainingSeconds = Math.max(0, Math.round((new Date(state.currentQuestionEndsAt).getTime() - Date.now()) / 1000));
            }
            return reply.send({
                currentQuestionIndex: state.currentQuestionIndex,
                timeRemainingSeconds,
                status: state.status,
            });
        }
        catch (err) {
            if (err.message === "duplicate_device") {
                return reply.code(409).send({ error: "duplicate_device" });
            }
            return reply.code(500).send({ error: err.message });
        }
    });
    // 7. Void a question (Teacher only)
    app.post("/quizzes/:quizId/questions/:questionId/void", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { quizId, questionId } = request.params;
        try {
            await (0, service_1.voidQuestionAndRecalculate)(quizId, questionId);
            return reply.send({ ok: true });
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
}
