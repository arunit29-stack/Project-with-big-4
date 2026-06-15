import type { AuthContext } from "@/lib/server/auth/types";

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}
