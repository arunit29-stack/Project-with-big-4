import { NextRequest, NextResponse } from "next/server";
import type { LoginResponse, UserRole } from "@/types/auth";
import { issueLoginToken } from "@/lib/server/auth/next";

/** Dev mock users — replace with real auth service integration. */
const MOCK_USERS: Record<
  string,
  { password: string; id: string; role: UserRole; institutionId: string }
> = {
  "student@cbb.edu": {
    password: "password",
    id: "u-student-1",
    role: "student",
    institutionId: "inst-demo",
  },
  "teacher@cbb.edu": {
    password: "password",
    id: "u-teacher-1",
    role: "teacher",
    institutionId: "inst-demo",
  },
  "admin@cbb.edu": {
    password: "password",
    id: "u-admin-1",
    role: "admin",
    institutionId: "inst-demo",
  },
};

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
    token: await issueLoginToken({
      userId: account.id,
      role: account.role,
      institutionId: account.institutionId,
    }),
    user: {
      id: account.id,
      role: account.role,
      email,
      institutionId: account.institutionId,
    },
  };

  return NextResponse.json(response);
}
