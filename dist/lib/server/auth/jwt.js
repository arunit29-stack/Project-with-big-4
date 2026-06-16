"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ACCESS_TOKEN_TTL_SECONDS = void 0;
exports.issueAccessToken = issueAccessToken;
exports.verifyAccessToken = verifyAccessToken;
exports.decodeLogoutToken = decodeLogoutToken;
exports.blocklistKey = blocklistKey;
exports.isTokenBlocked = isTokenBlocked;
exports.revokeTokenByJti = revokeTokenByJti;
exports.revokeAccessToken = revokeAccessToken;
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const jose_1 = require("jose");
exports.MAX_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const BLOCKLIST_PREFIX = "cbb:auth:blocklist:";
let keyMaterialPromise = null;
const DEV_KEY_CACHE_PATH = (0, path_1.join)(process.cwd(), ".next", "cache", "cbb-dev-jwt-keys.json");
function normalizePem(value) {
    return value.trim().replace(/\\n/g, "\n");
}
async function getKeyMaterial() {
    keyMaterialPromise !== null && keyMaterialPromise !== void 0 ? keyMaterialPromise : (keyMaterialPromise = (async () => {
        const privateKeyPem = process.env.JWT_PRIVATE_KEY;
        const publicKeyPem = process.env.JWT_PUBLIC_KEY;
        if (privateKeyPem && publicKeyPem) {
            return {
                privateKey: await (0, jose_1.importPKCS8)(normalizePem(privateKeyPem), "RS256"),
                publicKey: await (0, jose_1.importSPKI)(normalizePem(publicKeyPem), "RS256"),
            };
        }
        try {
            const cached = JSON.parse(await (0, promises_1.readFile)(DEV_KEY_CACHE_PATH, "utf8"));
            if (cached.privateKeyPem && cached.publicKeyPem) {
                return {
                    privateKey: await (0, jose_1.importPKCS8)(normalizePem(cached.privateKeyPem), "RS256"),
                    publicKey: await (0, jose_1.importSPKI)(normalizePem(cached.publicKeyPem), "RS256"),
                };
            }
        }
        catch (_a) {
            // No cached dev keypair yet; generate one below.
        }
        const generated = await (0, jose_1.generateKeyPair)("RS256");
        try {
            await (0, promises_1.mkdir)((0, path_1.join)(process.cwd(), ".next", "cache"), { recursive: true });
            await (0, promises_1.writeFile)(DEV_KEY_CACHE_PATH, JSON.stringify({
                privateKeyPem: await (0, jose_1.exportPKCS8)(generated.privateKey),
                publicKeyPem: await (0, jose_1.exportSPKI)(generated.publicKey),
            }, null, 2), "utf8");
        }
        catch (error) {
            console.warn("[auth] unable to persist dev JWT keypair", error);
        }
        console.warn("[auth] JWT_PRIVATE_KEY/JWT_PUBLIC_KEY not set; using a persisted dev RSA keypair");
        return generated;
    })());
    return keyMaterialPromise;
}
async function getSigningKey() {
    const { privateKey } = await getKeyMaterial();
    return privateKey;
}
async function getVerificationKey() {
    const { publicKey } = await getKeyMaterial();
    return publicKey;
}
function toAuthContext(token, payload) {
    const sub = payload.sub;
    const email = payload.email;
    const role = payload.role;
    const institutionId = payload.institutionId;
    const jti = payload.jti;
    if (typeof sub !== "string") {
        throw new Error("JWT payload missing sub");
    }
    if (typeof email !== "string") {
        throw new Error("JWT payload missing email");
    }
    if (role !== "admin" && role !== "teacher" && role !== "student") {
        throw new Error("JWT payload missing role");
    }
    if (typeof institutionId !== "string") {
        throw new Error("JWT payload missing institutionId");
    }
    if (typeof jti !== "string") {
        throw new Error("JWT payload missing jti");
    }
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
        throw new Error("JWT payload missing iat/exp");
    }
    return {
        userId: sub,
        email,
        role,
        institutionId,
        jti,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
    };
}
async function issueAccessToken(input) {
    const signingKey = await getSigningKey();
    const expiresAt = new Date(Date.now() + exports.MAX_ACCESS_TOKEN_TTL_SECONDS * 1000);
    return new jose_1.SignJWT({
        email: input.email,
        role: input.role,
        institutionId: input.institutionId,
    })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setSubject(input.userId)
        .setJti((0, crypto_1.randomUUID)())
        .setIssuedAt()
        .setExpirationTime(expiresAt)
        .sign(signingKey);
}
async function verifyAccessToken(token) {
    const verificationKey = await getVerificationKey();
    const { payload } = await (0, jose_1.jwtVerify)(token, verificationKey, {
        algorithms: ["RS256"],
    });
    const auth = toAuthContext(token, payload);
    if (await isTokenBlocked(auth.jti)) {
        throw new Error("Token revoked");
    }
    return auth;
}
function decodeLogoutToken(token) {
    try {
        const payload = (0, jose_1.decodeJwt)(token);
        if (typeof payload.sub !== "string" ||
            typeof payload.email !== "string" ||
            payload.role !== "admin" &&
                payload.role !== "teacher" &&
                payload.role !== "student" ||
            typeof payload.institutionId !== "string" ||
            typeof payload.iat !== "number" ||
            typeof payload.exp !== "number" ||
            typeof payload.jti !== "string") {
            return null;
        }
        return payload;
    }
    catch (_a) {
        return null;
    }
}
function blocklistKey(jti) {
    return `${BLOCKLIST_PREFIX}${jti}`;
}
async function isTokenBlocked(jti) {
    const client = await Promise.resolve().then(() => __importStar(require("./redis"))).then((module) => module.getRedisClient());
    if (!client) {
        return false;
    }
    const blocked = await client.get(blocklistKey(jti));
    return blocked !== null;
}
async function revokeTokenByJti(jti, expiresAt) {
    const ttlSeconds = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
    const client = await Promise.resolve().then(() => __importStar(require("./redis"))).then((module) => module.getRedisClient());
    if (!client) {
        return;
    }
    await client.set(blocklistKey(jti), "1", { EX: ttlSeconds });
}
async function revokeAccessToken(token) {
    const decoded = decodeLogoutToken(token);
    if (!decoded) {
        return;
    }
    await revokeTokenByJti(decoded.jti, decoded.exp);
}
