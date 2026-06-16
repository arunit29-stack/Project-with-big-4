import Fastify from "fastify";
import { requireAuth } from "@/lib/server/auth/fastify";

const fastify = Fastify({ logger: true });

fastify.get(
  "/courses/:id/analytics",
  { preHandler: requireAuth(["teacher", "admin"]) },
  async (request) => {
    return {
      courseId: (request.params as { id: string }).id,
      viewer: request.auth,
      analytics: [],
    };
  },
);

fastify.get(
  "/students/me/courses",
  { preHandler: requireAuth(["student"]) },
  async (request) => ({
    viewer: request.auth,
    courses: [],
  }),
);

fastify.post(
  "/auth/logout",
  { preHandler: requireAuth(["admin", "teacher", "student"]) },
  async (request, reply) => {
    reply.code(204).send();
  },
);

export { fastify };
