"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBearerTokenFromRequest = getBearerTokenFromRequest;
exports.requireNextAuth = requireNextAuth;
exports.handleLogoutRequest = handleLogoutRequest;
exports.issueLoginToken = issueLoginToken;
exports.decodeBearerForUserId = decodeBearerForUserId;
const server_1 = require("next/server");
const jwt_1 = require("./jwt");
function getBearerTokenFromRequest(request) {
    const header = request.headers.get("authorization");
    if (!(header === null || header === void 0 ? void 0 : header.startsWith("Bearer "))) {
        return null;
    }
    return header.slice("Bearer ".length).trim() || null;
}
async function requireNextAuth(request, allowedRoles) {
    const token = getBearerTokenFromRequest(request);
    if (!token) {
        return server_1.NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    try {
        const auth = await (0, jwt_1.verifyAccessToken)(token);
        if (allowedRoles.length > 0 && !allowedRoles.includes(auth.role)) {
            return server_1.NextResponse.json({ error: "forbidden" }, { status: 403 });
        }
        return auth;
    }
    catch (_a) {
        return server_1.NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
}
async function handleLogoutRequest(request) {
    var _a;
    const token = (_a = getBearerTokenFromRequest(request)) !== null && _a !== void 0 ? _a : (await request.text()).trim();
    if (token) {
        await (0, jwt_1.revokeAccessToken)(token).catch(() => undefined);
    }
    return new server_1.NextResponse(null, { status: 204 });
}
async function issueLoginToken(input) {
    return (0, jwt_1.issueAccessToken)(input);
}
function decodeBearerForUserId(request) {
    var _a;
    const token = getBearerTokenFromRequest(request);
    if (!token) {
        return null;
    }
    const decoded = (0, jwt_1.decodeLogoutToken)(token);
    return (_a = decoded === null || decoded === void 0 ? void 0 : decoded.sub) !== null && _a !== void 0 ? _a : null;
}
