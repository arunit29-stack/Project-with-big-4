import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/server/auth/fastify";
import {
  countUnreadNotifications,
  getNotificationsPage,
  markAllNotificationsRead,
  softDeleteNotification,
} from "../../lib/server/notifications/store";

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get(
    "/notifications",
    { preHandler: requireAuth(["student", "teacher", "admin"]) },
    async (request) => {
      const page = Math.max(1, Number((request.query as { page?: string }).page ?? "1"));
      const limit = Math.min(
        100,
        Math.max(1, Number((request.query as { limit?: string }).limit ?? "20")),
      );
      const result = await getNotificationsPage({
        userId: request.auth.userId,
        page,
        limit,
      });
      const unreadCount = await countUnreadNotifications(request.auth.userId);

      return {
        items: result.items,
        page,
        limit,
        total: result.total,
        unreadCount,
      };
    },
  );

  app.patch(
    "/notifications/read-all",
    { preHandler: requireAuth(["student", "teacher", "admin"]) },
    async (request) => {
      await markAllNotificationsRead(request.auth.userId);
      return { ok: true };
    },
  );

  app.delete(
    "/notifications/:id",
    { preHandler: requireAuth(["student", "teacher", "admin"]) },
    async (request) => {
      const { id } = request.params as { id: string };
      await softDeleteNotification(request.auth.userId, id);
      return { ok: true };
    },
  );
}
