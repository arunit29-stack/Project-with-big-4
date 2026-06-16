"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLibraryRoutes = registerLibraryRoutes;
const fastify_1 = require("../../lib/server/auth/fastify");
const service_1 = require("../../lib/server/library/service");
async function registerLibraryRoutes(app) {
    app.post("/courses/:courseId/library/pdf/presign", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { courseId } = request.params;
        const body = request.body;
        if (typeof body.week !== "number" ||
            typeof body.topic !== "string" ||
            typeof body.fileName !== "string" ||
            typeof body.size !== "number" ||
            typeof body.mimeType !== "string") {
            return reply.code(400).send({ error: "invalid" });
        }
        try {
            return await (0, service_1.presignPdfUpload)({
                courseId,
                week: body.week,
                topic: body.topic,
                fileName: body.fileName,
                size: body.size,
                mimeType: body.mimeType,
            });
        }
        catch (error) {
            return reply.code(400).send({ error: "invalid" });
        }
    });
    app.post("/courses/:courseId/library/pdf/confirm", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { courseId } = request.params;
        const body = request.body;
        if (typeof body.fileId !== "string" ||
            typeof body.week !== "number" ||
            typeof body.topic !== "string" ||
            typeof body.fileName !== "string") {
            return reply.code(400).send({ error: "invalid" });
        }
        const ok = await (0, service_1.confirmPdfUpload)({
            courseId,
            fileId: body.fileId,
            week: body.week,
            topic: body.topic,
            fileName: body.fileName,
        });
        if (!ok)
            return reply.code(404).send({ error: "not_found" });
        return reply.send({ ok: true, indexQueued: true });
    });
    app.get("/courses/:courseId/library", { preHandler: (0, fastify_1.requireAuth)(["student", "teacher"]) }, async (request, reply) => {
        const { courseId } = request.params;
        try {
            const tree = await (0, service_1.buildLibraryTree)(courseId, request.auth.role, request.auth.userId);
            return reply.send({ weeks: tree });
        }
        catch (error) {
            if (error.message === "forbidden") {
                return reply.code(403).send({ error: "forbidden" });
            }
            return reply.code(500).send({ error: "internal_error" });
        }
    });
    app.delete("/courses/:courseId/library/files/:fileId", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        const { courseId, fileId } = request.params;
        const ok = await (0, service_1.deleteLibraryFile)(courseId, fileId);
        if (!ok)
            return reply.code(404).send({ error: "not_found" });
        return reply.send({ ok: true });
    });
    app.post("/courses/:courseId/library/video/tus-init", { preHandler: (0, fastify_1.requireAuth)(["teacher"]) }, async (request, reply) => {
        var _a;
        const { courseId } = request.params;
        const body = request.body;
        if (typeof body.fileHash !== "string" ||
            typeof body.fileName !== "string" ||
            typeof body.size !== "number") {
            return reply.code(400).send({ error: "invalid" });
        }
        const session = await (0, service_1.createVideoTusSession)({
            courseId,
            fileHash: body.fileHash,
            fileName: body.fileName,
            size: body.size,
        });
        return reply
            .header("Upload-URL", `${(_a = process.env.NEXT_PUBLIC_API_URL) !== null && _a !== void 0 ? _a : ""}/api/courses/${courseId}/library/video/${session.uploadId}`)
            .header("Tus-Resumable", "1.0.0")
            .send({ uploadId: session.uploadId });
    });
    app.patch("/courses/:courseId/library/video/:videoId/status", async (request, reply) => {
        const { courseId, videoId } = request.params;
        const body = request.body;
        if (!body.status) {
            return reply.code(400).send({ error: "invalid" });
        }
        const ok = await (0, service_1.setVideoStatus)({
            courseId,
            videoId,
            status: body.status,
        });
        if (!ok)
            return reply.code(404).send({ error: "not_found" });
        return reply.send({ ok: true });
    });
}
