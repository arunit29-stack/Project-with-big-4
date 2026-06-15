import { NextResponse, type NextRequest } from "next/server";
import { decodeLogoutToken, issueAccessToken, revokeAccessToken, verifyAccessToken } from "./jwt";
import type { AuthContext, Role } from "./types";

export function getBearerTokenFromRequest(request: Request | NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim() || null;
}

export async function requireNextAuth(
  request: Request | NextRequest,
  allowedRoles: Role[],
): Promise<AuthContext | Response> {
  const token = getBearerTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const auth = await verifyAccessToken(token);
    if (allowedRoles.length > 0 && !allowedRoles.includes(auth.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return auth;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}

export async function handleLogoutRequest(
  request: Request | NextRequest,
): Promise<NextResponse> {
  const token = getBearerTokenFromRequest(request) ?? (await request.text()).trim();
  if (token) {
    await revokeAccessToken(token).catch(() => undefined);
  }
  return new NextResponse(null, { status: 204 });
}

export async function issueLoginToken(input: {
  userId: string;
  role: Role;
  institutionId: string;
}): Promise<string> {
  return issueAccessToken(input);
}

export function decodeBearerForUserId(request: Request | NextRequest): string | null {
  const token = getBearerTokenFromRequest(request);
  if (!token) {
    return null;
  }
  const decoded = decodeLogoutToken(token);
  return decoded?.sub ?? null;
}
