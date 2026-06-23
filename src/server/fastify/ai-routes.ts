import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/server/auth/fastify";
import {
  askCourseAi,
  ensureStudentEnrollment,
  ensureTeacherOwnsCourse,
  listCourseAiQueryLogs,
  type ChatMessage,
} from "../../lib/server/ai/service";

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function sanitizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ChatMessage => {
      const candidate = item as ChatMessage;
      return (
        item &&
        typeof item === "object" &&
        (candidate.role === "user" || candidate.role === "assistant") &&
        typeof candidate.content === "string"
      );
    })
    .slice(-20)
    .map((item) => ({
      role: item.role,
      content: item.content.slice(0, 4000),
    }));
}

export async function registerAiRoutes(app: FastifyInstance) {
  app.post(
    "/courses/:courseId/ai/chat",
    { preHandler: requireAuth(["student"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      const body = request.body as {
        message?: string;
        conversationHistory?: unknown;
      };
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) {
        return reply.code(400).send({ error: "message_required" });
      }
      if (!(await ensureStudentEnrollment(request.auth.userId, courseId))) {
        return reply.code(403).send({ error: "forbidden" });
      }

      try {
        return await askCourseAi({
          studentId: request.auth.userId,
          courseId,
          message,
          conversationHistory: sanitizeHistory(body.conversationHistory),
        });
      } catch (error) {
        request.log.error({ error }, "course ai chat failed");
        return reply.code(502).send({ error: "ai_unavailable" });
      }
    },
  );

  app.get(
    "/courses/:courseId/ai/query-logs",
    { preHandler: requireAuth(["teacher"]) },
    async (request, reply) => {
      const { courseId } = request.params as { courseId: string };
      if (!(await ensureTeacherOwnsCourse(request.auth.userId, courseId))) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const query = request.query as {
        studentId?: string;
        startDate?: string;
        endDate?: string;
        page?: string;
        limit?: string;
      };
      try {
        return await listCourseAiQueryLogs({
          courseId,
          studentId: query.studentId,
          startDate: query.startDate,
          endDate: query.endDate,
          page: parsePositiveInt(query.page, 1, 100000),
          limit: parsePositiveInt(query.limit, 25, 100),
        });
      } catch (error) {
        request.log.error({ error }, "course ai query logs failed");
        return reply.code(502).send({ error: "ai_unavailable" });
      }
    },
  );
}
