"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminRoutes = registerAdminRoutes;
const fastify_1 = require("../../lib/server/auth/fastify");
const users_1 = require("../../lib/server/admin/users");
const transfer_1 = require("../../lib/server/admin/transfer");
const export_1 = require("../../lib/server/admin/export");
const gdpr_1 = require("../../lib/server/admin/gdpr");
const settings_1 = require("../../lib/server/admin/settings");
async function registerAdminRoutes(app) {
    /**
     * POST /admin/users/bulk-enrol
     * Bulk enrol users from CSV
     * Admin only
     */
    app.post("/admin/users/bulk-enrol", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        try {
            const body = request.body;
            if (!body.csv) {
                return reply.code(400).send({ error: "csv_content_required" });
            }
            const result = await (0, users_1.bulkEnrolUsers)(request.auth.institutionId, body.csv);
            return reply.send(result);
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * POST /admin/users
     * Create single user (teacher or student)
     * Admin only
     */
    app.post("/admin/users", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        try {
            const body = request.body;
            if (!body.email || !body.name || !body.role) {
                return reply.code(400).send({ error: "missing_required_fields" });
            }
            const result = await (0, users_1.createUser)(request.auth.institutionId, body);
            return reply.send(result);
        }
        catch (err) {
            return reply.code(400).send({ error: err.message });
        }
    });
    /**
     * DELETE /admin/users/:userId
     * Soft delete user (removes from enrollments, invalidates sessions)
     * Admin only
     */
    app.delete("/admin/users/:userId", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        var _a;
        const { userId } = request.params;
        try {
            const reason = (_a = request.body) === null || _a === void 0 ? void 0 : _a.reason;
            await (0, users_1.deleteUser)(userId, request.auth.userId, request.auth.institutionId, reason);
            return reply.send({ ok: true });
        }
        catch (err) {
            return reply.code(400).send({ error: err.message });
        }
    });
    /**
     * PATCH /admin/users/:userId/reset-password
     * Reset user password (send temp password via email)
     * Admin only
     */
    app.patch("/admin/users/:userId/reset-password", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        const { userId } = request.params;
        try {
            const tempPassword = await (0, users_1.resetUserPassword)(userId);
            return reply.send({
                userId,
                tempPassword,
                message: "Temporary password sent to user email",
            });
        }
        catch (err) {
            return reply.code(400).send({ error: err.message });
        }
    });
    /**
     * POST /admin/courses/:courseId/transfer
     * Transfer course ownership and all assets to new teacher
     * Admin only, atomic transaction
     */
    app.post("/admin/courses/:courseId/transfer", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        const { courseId } = request.params;
        try {
            const body = request.body;
            if (!body.newTeacherUserId) {
                return reply.code(400).send({ error: "new_teacher_user_id_required" });
            }
            const result = await (0, transfer_1.transferCourse)(courseId, body.newTeacherUserId, request.auth.userId, request.auth.institutionId);
            return reply.send(result);
        }
        catch (err) {
            return reply.code(400).send({ error: err.message });
        }
    });
    /**
     * GET /admin/institutions/:institutionId/grades/export
     * Export all grades as CSV
     * Admin only
     */
    app.get("/admin/institutions/:institutionId/grades/export", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        const { institutionId } = request.params;
        try {
            // Verify admin is from same institution
            if (request.auth.institutionId !== institutionId) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const csv = await (0, export_1.exportGradesAsCSV)(institutionId);
            const summary = await (0, export_1.getExportSummary)(institutionId);
            // Return as downloadable file
            reply.type("text/csv");
            reply.header("Content-Disposition", `attachment; filename="grades-export-${new Date().toISOString().split("T")[0]}.csv"`);
            return reply.send(csv);
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * DELETE /admin/users/:userId/purge-pii
     * Full GDPR/FERPA PII purge (irreversible)
     * Admin only, immutable audit trail
     */
    app.delete("/admin/users/:userId/purge-pii", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        var _a;
        const { userId } = request.params;
        try {
            const reason = (_a = request.body) === null || _a === void 0 ? void 0 : _a.reason;
            const result = await (0, gdpr_1.purgeUserPII)(userId, request.auth.userId, request.auth.institutionId, reason);
            return reply.send(result);
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * GET /admin/institutions/:institutionId/settings
     * Get institution settings (SSO, branding, features)
     * Admin only
     */
    app.get("/admin/institutions/:institutionId/settings", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        const { institutionId } = request.params;
        try {
            // Verify admin is from same institution
            if (request.auth.institutionId !== institutionId) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const settings = await (0, settings_1.getInstitutionSettings)(institutionId);
            if (!settings) {
                return reply.code(404).send({ error: "settings_not_found" });
            }
            return reply.send(settings);
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * PATCH /admin/institutions/:institutionId/settings
     * Update institution settings
     * Admin only
     */
    app.patch("/admin/institutions/:institutionId/settings", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        const { institutionId } = request.params;
        try {
            // Verify admin is from same institution
            if (request.auth.institutionId !== institutionId) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const body = request.body;
            const updated = await (0, settings_1.updateInstitutionSettings)(institutionId, body);
            return reply.send(updated);
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
    /**
     * GET /admin/institutions/:institutionId/gdpr-audit-log
     * List all GDPR purges (immutable audit log)
     * Admin only
     */
    app.get("/admin/institutions/:institutionId/gdpr-audit-log", { preHandler: (0, fastify_1.requireAuth)(["admin"]) }, async (request, reply) => {
        const { institutionId } = request.params;
        try {
            // Verify admin is from same institution
            if (request.auth.institutionId !== institutionId) {
                return reply.code(403).send({ error: "forbidden" });
            }
            const purges = await (0, gdpr_1.listGDPRPurges)(institutionId);
            return reply.send({ purges });
        }
        catch (err) {
            return reply.code(500).send({ error: err.message });
        }
    });
}
