"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateFastifyRequest = authenticateFastifyRequest;
exports.requireAuth = requireAuth;
const jwt_1 = require("./jwt");
function unauthorized(reply) {
    return reply.code(401).send({ error: "unauthorized" });
}
function forbidden(reply) {
    return reply.code(403).send({ error: "forbidden" });
}
function getBearerToken(header) {
    if (!(header === null || header === void 0 ? void 0 : header.startsWith("Bearer "))) {
        return null;
    }
    return header.slice("Bearer ".length).trim() || null;
}
async function authenticateFastifyRequest(request) {
    const token = getBearerToken(request.headers.authorization);
    if (!token) {
        return null;
    }
    try {
        return await (0, jwt_1.verifyAccessToken)(token);
    }
    catch (_a) {
        return null;
    }
}
function requireAuth(allowedRoles) {
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
