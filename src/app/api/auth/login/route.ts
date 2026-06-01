import { NextRequest, NextResponse } from "next/server";
import type { LoginResponse, UserRole } from "@/types/auth";

/** Dev mock users — replace with real auth service integration. */
const MOCK_USERS: Record<
  string,
  { password: string; id: string; role: UserRole }
> = {
  "student@cbb.edu": { password: "password", id: "u-student-1", role: "student" },
  "teacher@cbb.edu": { password: "password", id: "u-teacher-1", role: "teacher" },
  "admin@cbb.edu": { password: "password", id: "u-admin-1", role: "admin" },
};

function signMockToken(userId: string, role: UserRole): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, role, iat: Date.now() }),
  ).toString("base64url");
  return `cbb.mock.${payload}`;
}

export async function POST(request: NextRequest) {
  let email: string;
  let password: string;

  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = (body.email ?? "").trim().toLowerCase();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const account = MOCK_USERS[email];
  if (!account || account.password !== password) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const response: LoginResponse = {
    token: signMockToken(account.id, account.role),
    user: { id: account.id, role: account.role, email },
  };

  return NextResponse.json(response);
}
