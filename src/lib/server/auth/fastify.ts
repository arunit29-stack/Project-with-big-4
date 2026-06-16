import { verifyAccessToken } from "./jwt";
import type { AuthContext, Role } from "./types";

type FastifyReply = {
  code: (statusCode: number) => {
    send: (payload: unknown) => unknown;
  };
};

type FastifyRequest = {
  headers: {
    authorization?: string;
  };
  auth: AuthContext;
};

type PreHandlerHookHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void> | void;

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

export function requireAuth(allowedRoles: Role[]): PreHandlerHookHandler {
  return async (request, reply) => {
    const auth = await authenticateFastifyRequest(request);
    if (!auth) {
      unauthorized(reply);
      return;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(auth.role)) {
      forbidden(reply);
      return;
    }

    request.auth = auth;
  };
}
