"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerNotificationRoutes = registerNotificationRoutes;
const fastify_1 = require("../../lib/server/auth/fastify");
const store_1 = require("../../lib/server/notifications/store");
async function registerNotificationRoutes(app) {
    app.get("/notifications", { preHandler: (0, fastify_1.requireAuth)(["student", "teacher", "admin"]) }, async (request) => {
        var _a, _b;
        const page = Math.max(1, Number((_a = request.query.page) !== null && _a !== void 0 ? _a : "1"));
        const limit = Math.min(100, Math.max(1, Number((_b = request.query.limit) !== null && _b !== void 0 ? _b : "20")));
        const result = await (0, store_1.getNotificationsPage)({
            userId: request.auth.userId,
            page,
            limit,
        });
        const unreadCount = await (0, store_1.countUnreadNotifications)(request.auth.userId);
        return {
            items: result.items,
            page,
            limit,
            total: result.total,
            unreadCount,
        };
    });
    app.patch("/notifications/read-all", { preHandler: (0, fastify_1.requireAuth)(["student", "teacher", "admin"]) }, async (request) => {
        await (0, store_1.markAllNotificationsRead)(request.auth.userId);
        return { ok: true };
    });
    app.delete("/notifications/:id", { preHandler: (0, fastify_1.requireAuth)(["student", "teacher", "admin"]) }, async (request) => {
        const { id } = request.params;
        await (0, store_1.softDeleteNotification)(request.auth.userId, id);
        return { ok: true };
    });
}
