import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  decodeJwt,
  generateKeyPair,
  exportPKCS8,
  exportSPKI,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type JWTPayload,
  SignJWT,
} from "jose";
import type { AuthClaims, AuthContext, Role } from "./types";

export const MAX_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const BLOCKLIST_PREFIX = "cbb:auth:blocklist:";

type KeyMaterial = Awaited<ReturnType<typeof generateKeyPair>>;

let keyMaterialPromise: Promise<KeyMaterial> | null = null;
const DEV_KEY_CACHE_PATH = join(process.cwd(), ".next", "cache", "cbb-dev-jwt-keys.json");

function normalizePem(value: string): string {
  return value.trim().replace(/\\n/g, "\n");
}

async function getKeyMaterial(): Promise<KeyMaterial> {
  keyMaterialPromise ??= (async () => {
    const privateKeyPem = process.env.JWT_PRIVATE_KEY;
    const publicKeyPem = process.env.JWT_PUBLIC_KEY;

    if (privateKeyPem && publicKeyPem) {
      return {
        privateKey: await importPKCS8(normalizePem(privateKeyPem), "RS256"),
        publicKey: await importSPKI(normalizePem(publicKeyPem), "RS256"),
      };
    }

    try {
      const cached = JSON.parse(await readFile(DEV_KEY_CACHE_PATH, "utf8")) as {
        privateKeyPem?: string;
        publicKeyPem?: string;
      };

      if (cached.privateKeyPem && cached.publicKeyPem) {
        return {
          privateKey: await importPKCS8(normalizePem(cached.privateKeyPem), "RS256"),
          publicKey: await importSPKI(normalizePem(cached.publicKeyPem), "RS256"),
        };
      }
    } catch {
      // No cached dev keypair yet; generate one below.
    }

    const generated = await generateKeyPair("RS256", {
    extractable: true,
    });
    try {
      await mkdir(join(process.cwd(), ".next", "cache"), { recursive: true });
      await writeFile(
        DEV_KEY_CACHE_PATH,
        JSON.stringify(
          {
            privateKeyPem: await exportPKCS8(generated.privateKey),
            publicKeyPem: await exportSPKI(generated.publicKey),
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch (error) {
      console.warn("[auth] unable to persist dev JWT keypair", error);
    }
    console.warn(
      "[auth] JWT_PRIVATE_KEY/JWT_PUBLIC_KEY not set; using a persisted dev RSA keypair",
    );
    return generated;
  })();

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

function toAuthContext(token: string, payload: JWTPayload): AuthContext {
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

export async function issueAccessToken(input: {
  userId: string;
  email: string;
  role: Role;
  institutionId: string;
}): Promise<string> {
  const signingKey = await getSigningKey();
  const expiresAt = new Date(Date.now() + MAX_ACCESS_TOKEN_TTL_SECONDS * 1000);

  return new SignJWT({
    email: input.email,
    role: input.role,
    institutionId: input.institutionId,
  })
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
      typeof payload.email !== "string" ||
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
  if (!client) {
    return false;
  }
  const blocked = await client.get(blocklistKey(jti));
  return blocked !== null;
}

export async function revokeTokenByJti(jti: string, expiresAt: number): Promise<void> {
  const ttlSeconds = Math.max(1, expiresAt - Math.floor(Date.now() / 1000));
  const client = await import("./redis").then((module) => module.getRedisClient());
  if (!client) {
    return;
  }
  await client.set(blocklistKey(jti), "1", { EX: ttlSeconds });
}

export async function revokeAccessToken(token: string): Promise<void> {
  const decoded = decodeLogoutToken(token);
  if (!decoded) {
    return;
  }
  await revokeTokenByJti(decoded.jti, decoded.exp);
}
