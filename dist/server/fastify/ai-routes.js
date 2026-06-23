"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAiRoutes = registerAiRoutes;
const fastify_1 = require("../../lib/server/auth/fastify");
const service_1 = require("../../lib/server/ai/service");
function parsePositiveInt(value, fallback, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1)
        return fallback;
    return Math.min(Math.floor(parsed), max);
}
function sanitizeHistory(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter((item) => {
        const candidate = item;
        return (item &&
            typeof item === "object" &&
            (candidate.role === "user" || candidate.role === "assistant") &&
            typeof candidate.content === "string");
    })
        .slice(-20)
        .map((item) => ({
        role: item.role,
        content: item.content.slice(0, 4000),
    }));
}
async function registerAiRoutes(app) {
    app.post("/courses/:courseId/ai/chat", { preHandler: (0, fastify_1.requireAuth)(["student"]) }, async (request, reply) => {
        const { courseId } = request.params;
        const body = request.body;
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message) {
            return reply.code(400).send({ error: "message_required" });
        }
        if (!(await (0, service_1.ensureStudentEnrollment)(request.auth.userId, courseId))) {
            return reply.code(403).send({ error: "forbidden" });
        }
        try {
            return await (0, service_1.askCourseAi)({
                studentId: request.auth.userId,
                courseId,
                message,
                conversationHistory: sanitizeHistory(body.conversationHistory),
            });
        }
        catch (error) {
            request.log.error({ error }, "course ai chat failed");
            return reply.code(502).send({ error: "ai_unavailable" });
        }
    });
    app.get("/courses/:courseId/ai/query-logs", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { courseId } = request.params;
        if (!(await (0, service_1.ensureTeacherOwnsCourse)(request.auth.userId, courseId))) {
            return reply.code(403).send({ error: "forbidden" });
        }
        const query = request.query;
        try {
            return await (0, service_1.listCourseAiQueryLogs)({
                courseId,
                studentId: query.studentId,
                startDate: query.startDate,
                endDate: query.endDate,
                page: parsePositiveInt(query.page, 1, 100000),
                limit: parsePositiveInt(query.limit, 25, 100),
            });
        }
        catch (error) {
            request.log.error({ error }, "course ai query logs failed");
            return reply.code(502).send({ error: "ai_unavailable" });
        }
    });
}
