import { NextRequest, NextResponse } from "next/server";
import type { LoginResponse, UserRole } from "@/types/auth";
import { issueLoginToken } from "@/lib/server/auth/next";
import { getPostgresPool } from "@/lib/server/db/postgres";
import bcrypt from "bcrypt";

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

  const pool = getPostgresPool();

  try {
    const res = await pool.query(
      `SELECT id, password_hash, role, institution_id FROM users WHERE email = $1`,
      [email]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "invalid" }, { status: 401 });
    }

    const account = res.rows[0];

    const passwordMatch = await bcrypt.compare(password, account.password_hash);
    
    if (!passwordMatch) {
      return NextResponse.json({ error: "invalid" }, { status: 401 });
    }

    const response: LoginResponse = {
      token: await issueLoginToken({
        userId: account.id,
        email,
        role: account.role as UserRole,
        institutionId: account.institution_id,
      }),
      role: account.role as UserRole,
      user: {
        id: account.id,
        role: account.role as UserRole,
        email,
        institutionId: account.institution_id,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
