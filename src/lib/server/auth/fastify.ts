import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { verifyAccessToken } from "./jwt";
import type { AuthContext, Role } from "./types";

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({ error: "unauthorized" });
}

function forbidden(reply: FastifyReply) {
  return reply.code(403).send({ error: "forbidden" });
}

function getBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim() || null;
}

export async function authenticateFastifyRequest(
  request: FastifyRequest,
): Promise<AuthContext | null> {
  const token = getBearerToken(request.headers.authorization);
  if (!token) {
    return null;
  }

  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

export function requireAuth(allowedRoles: Role[]): preHandlerHookHandler {
  return async (request, reply) => {
    const auth = await authenticateFastifyRequest(request);
    if (!auth) {
      return unauthorized(reply);
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(auth.role)) {
      return forbidden(reply);
    }

    request.auth = auth;
  };
}
