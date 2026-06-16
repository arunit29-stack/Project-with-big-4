import { randomUUID } from "crypto";
import {
  decodeJwt,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type JWTPayload,
  SignJWT,
} from "jose";
import type { AuthClaims, AuthContext, Role } from "./types";

export const MAX_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const BLOCKLIST_PREFIX = "cbb:auth:blocklist:";

let signingKeyPromise: ReturnType<typeof importPKCS8> | null = null;
let verificationKeyPromise: ReturnType<typeof importSPKI> | null = null;

function normalizePem(value: string): string {
  return value.trim().replace(/\\n/g, "\n");
}

function getPrivateKeyPem(): string {
  const pem = process.env.JWT_PRIVATE_KEY;
  if (!pem) {
    throw new Error("JWT_PRIVATE_KEY is required for RS256 signing");
  }
  return normalizePem(pem);
}

function getPublicKeyPem(): string {
  const pem = process.env.JWT_PUBLIC_KEY;
  if (!pem) {
    throw new Error("JWT_PUBLIC_KEY is required for RS256 verification");
  }
  return normalizePem(pem);
}

async function getSigningKey() {
  signingKeyPromise ??= importPKCS8(getPrivateKeyPem(), "RS256");
  return signingKeyPromise;
}

async function getVerificationKey() {
  verificationKeyPromise ??= importSPKI(getPublicKeyPem(), "RS256");
  return verificationKeyPromise;
}

function toAuthContext(token: string, payload: JWTPayload): AuthContext {
  const sub = payload.sub;
  const role = payload.role;
  const institutionId = payload.institutionId;
  const jti = payload.jti;

  if (typeof sub !== "string") {
    throw new Error("JWT payload missing sub");
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
    role,
    institutionId,
    jti,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}

export async function issueAccessToken(input: {
  userId: string;
  role: Role;
  institutionId: string;
}): Promise<string> {
  const signingKey = await getSigningKey();
  const expiresAt = new Date(Date.now() + MAX_ACCESS_TOKEN_TTL_SECONDS * 1000);

  return new SignJWT({ role: input.role, institutionId: input.institutionId })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(signingKey);
}

export async function verifyAccessToken(token: string): Promise<AuthContext> {
  const verificationKey = await getVerificationKey();
  const { payload } = await jwtVerify(token, verificationKey, {
    algorithms: ["RS256"],
  });

  const auth = toAuthContext(token, payload);

  if (await isTokenBlocked(auth.jti)) {
    throw new Error("Token revoked");
  }

  return auth;
}

export function decodeLogoutToken(token: string): AuthClaims | null {
  try {
    const payload = decodeJwt(token) as Partial<AuthClaims>;
    if (
      typeof payload.sub !== "string" ||
      payload.role !== "admin" &&
      payload.role !== "teacher" &&
      payload.role !== "student" ||
      typeof payload.institutionId !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      typeof payload.jti !== "string"
    ) {
      return null;
    }
    return payload as AuthClaims;
  } catch {
    return null;
  }
}

export function blocklistKey(jti: string): string {
  return `${BLOCKLIST_PREFIX}${jti}`;
}

export async function isTokenBlocked(jti: string): Promise<boolean> {
  const client = await import("./redis").then((module) => module.getRedisClient());
  const blocked = await client.get(blocklistKey(jti));
  return blocked !== null;
}

export async function revokeTokenByJti(jti: string, expiresAt: number): Promise<void> {
  const ttlSeconds = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
  const client = await import("./redis").then((module) => module.getRedisClient());
  await client.set(blocklistKey(jti), "1", { EX: ttlSeconds });
}

export async function revokeAccessToken(token: string): Promise<void> {
  const decoded = decodeLogoutToken(token);
  if (!decoded) {
    return;
  }
  await revokeTokenByJti(decoded.jti, decoded.exp);
}
