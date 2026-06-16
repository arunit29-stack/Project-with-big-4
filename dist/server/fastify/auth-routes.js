"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BCRYPT_COST_FACTOR = void 0;
exports.hashPassword = hashPassword;
exports.registerAuthRoutes = registerAuthRoutes;
const bcrypt_1 = __importDefault(require("bcrypt"));
const postgres_1 = require("../../lib/server/db/postgres");
const fastify_1 = require("../../lib/server/auth/fastify");
const jwt_1 = require("../../lib/server/auth/jwt");
const ALL_ROLES = ["admin", "teacher", "student"];
const INVALID_LOGIN_MESSAGE = "Invalid email or password. Please try again.";
exports.BCRYPT_COST_FACTOR = 12;
function isRole(value) {
    return value === "admin" || value === "teacher" || value === "student";
}
function normalizeEmail(email) {
    return (email !== null && email !== void 0 ? email : "").trim().toLowerCase();
}
function logFailedLogin(request, email) {
    request.log.warn({
        ip: request.ip,
        timestamp: new Date().toISOString(),
        email,
    }, "failed login attempt");
}
function sendInvalidLogin(reply) {
    return reply.code(401).send({ message: INVALID_LOGIN_MESSAGE });
}
async function findUserByEmail(email) {
    const result = await (0, postgres_1.getPostgresPool)().query(`
      SELECT id, email, password_hash, role, institution_id
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `, [email]);
    const user = result.rows[0];
    if (!user || !isRole(user.role)) {
        return null;
    }
    return user;
}
function extractPlainTextToken(body) {
    if (typeof body === "string") {
        return body.trim() || null;
    }
    if (Buffer.isBuffer(body)) {
        return body.toString("utf8").trim() || null;
    }
    return null;
}
async function hashPassword(password) {
    return bcrypt_1.default.hash(password, exports.BCRYPT_COST_FACTOR);
}
async function registerAuthRoutes(app) {
    app.post("/auth/login", {
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
    }, async (request, reply) => {
        var _a;
        const email = normalizeEmail(request.body.email);
        const password = (_a = request.body.password) !== null && _a !== void 0 ? _a : "";
        if (!email || !password) {
            logFailedLogin(request, email);
            return sendInvalidLogin(reply);
        }
        const user = await findUserByEmail(email);
        const passwordMatches = user
            ? await bcrypt_1.default.compare(password, user.password_hash)
            : false;
        if (!user || !passwordMatches) {
            logFailedLogin(request, email);
            return sendInvalidLogin(reply);
        }
        const token = await (0, jwt_1.issueAccessToken)({
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
    });
    app.post("/auth/logout", { preHandler: (0, fastify_1.requireAuth)(ALL_ROLES) }, async (request, reply) => {
        await (0, jwt_1.revokeTokenByJti)(request.auth.jti, request.auth.expiresAt);
        return reply.code(200).send({ message: "Logged out" });
    });
    app.post("/auth/session-beacon", {
        schema: {
            body: { type: "string" },
        },
    }, async (request, reply) => {
        const token = extractPlainTextToken(request.body);
        if (token) {
            const decoded = (0, jwt_1.decodeLogoutToken)(token);
            if (decoded) {
                void (0, jwt_1.revokeTokenByJti)(decoded.jti, decoded.exp).catch((error) => {
                    request.log.warn({ error }, "session beacon revocation failed");
                });
            }
        }
        return reply.code(200).send({ message: "OK" });
    });
    app.get("/auth/me", { preHandler: (0, fastify_1.requireAuth)(ALL_ROLES) }, async (request) => ({
        id: request.auth.userId,
        email: request.auth.email,
        role: request.auth.role,
        institutionId: request.auth.institutionId,
    }));
}
