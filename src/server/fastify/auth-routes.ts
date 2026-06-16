import bcrypt from "bcrypt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getPostgresPool } from "../../lib/server/db/postgres";
import { requireAuth } from "../../lib/server/auth/fastify";
import {
  decodeLogoutToken,
  issueAccessToken,
  revokeTokenByJti,
} from "../../lib/server/auth/jwt";
import type { Role } from "../../lib/server/auth/types";

const ALL_ROLES: Role[] = ["admin", "teacher", "student"];
const INVALID_LOGIN_MESSAGE = "Invalid email or password. Please try again.";
export const BCRYPT_COST_FACTOR = 12;

type LoginBody = {
  email?: string;
  password?: string;
};

type DbUser = {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  institution_id: string;
};

function isRole(value: unknown): value is Role {
  return value === "admin" || value === "teacher" || value === "student";
}

function normalizeEmail(email: string | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function logFailedLogin(request: FastifyRequest, email: string): void {
  request.log.warn(
    {
      ip: request.ip,
      timestamp: new Date().toISOString(),
      email,
    },
    "failed login attempt",
  );
}

function sendInvalidLogin(reply: FastifyReply) {
  return reply.code(401).send({ message: INVALID_LOGIN_MESSAGE });
}

async function findUserByEmail(email: string): Promise<DbUser | null> {
  const result = await getPostgresPool().query<DbUser>(
    `
      SELECT id, email, password_hash, role, institution_id
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email],
  );

  const user = result.rows[0];
  if (!user || !isRole(user.role)) {
    return null;
  }

  return user;
}

function extractPlainTextToken(body: unknown): string | null {
  if (typeof body === "string") {
    return body.trim() || null;
  }

  if (Buffer.isBuffer(body)) {
    return body.toString("utf8").trim() || null;
  }

  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          additionalProperties: false,
          properties: {
            email: { type: "string" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const password = request.body.password ?? "";

      if (!email || !password) {
        logFailedLogin(request, email);
        return sendInvalidLogin(reply);
      }

      const user = await findUserByEmail(email);
      const passwordMatches = user
        ? await bcrypt.compare(password, user.password_hash)
        : false;

      if (!user || !passwordMatches) {
        logFailedLogin(request, email);
        return sendInvalidLogin(reply);
      }

      const token = await issueAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        institutionId: user.institution_id,
      });

      return reply.send({
        token,
        role: user.role,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          institutionId: user.institution_id,
        },
      });
    },
  );

  app.post(
    "/auth/logout",
    { preHandler: requireAuth(ALL_ROLES) },
    async (request, reply) => {
      await revokeTokenByJti(request.auth.jti, request.auth.expiresAt);
      return reply.code(200).send({ message: "Logged out" });
    },
  );

  app.post(
    "/auth/session-beacon",
    {
      schema: {
        body: { type: "string" },
      },
    },
    async (request, reply) => {
      const token = extractPlainTextToken(request.body);
      if (token) {
        const decoded = decodeLogoutToken(token);
        if (decoded) {
          void revokeTokenByJti(decoded.jti, decoded.exp).catch((error) => {
            request.log.warn({ error }, "session beacon revocation failed");
          });
        }
      }

      return reply.code(200).send({ message: "OK" });
    },
  );

  app.get(
    "/auth/me",
    { preHandler: requireAuth(ALL_ROLES) },
    async (request) => ({
      id: request.auth.userId,
      email: request.auth.email,
      role: request.auth.role,
      institutionId: request.auth.institutionId,
    }),
  );
}
