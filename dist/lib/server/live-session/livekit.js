"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLiveKitToken = createLiveKitToken;
const livekit_server_sdk_1 = require("livekit-server-sdk");
function required(value, fallback) {
    const resolved = value !== null && value !== void 0 ? value : fallback;
    if (!resolved) {
        throw new Error("LiveKit credentials are required");
    }
    return resolved;
}
async function createLiveKitToken(input) {
    var _a, _b, _c, _d;
    const apiKey = required(process.env.LIVEKIT_API_KEY);
    const apiSecret = required(process.env.LIVEKIT_API_SECRET, process.env.LIVEKIT_SECRET);
    const token = new livekit_server_sdk_1.AccessToken(apiKey, apiSecret, {
        identity: input.userId,
        name: (_b = (_a = input.name) !== null && _a !== void 0 ? _a : input.email) !== null && _b !== void 0 ? _b : input.userId,
        ttl: "60m",
    });
    token.addGrant({
        roomJoin: true,
        room: input.sessionId,
        canSubscribe: true,
        canPublish: (_c = input.canPublish) !== null && _c !== void 0 ? _c : input.role === "teacher",
        canPublishData: true,
        canUpdateOwnMetadata: true,
    });
    return {
        serverUrl: (_d = process.env.NEXT_PUBLIC_LIVEKIT_URL) !== null && _d !== void 0 ? _d : "",
        token: await token.toJwt(),
    };
}
