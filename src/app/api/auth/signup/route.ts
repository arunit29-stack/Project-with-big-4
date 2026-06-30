import { NextRequest, NextResponse } from "next/server";
import { getPostgresPool } from "@/lib/server/db/postgres";
import { issueLoginToken } from "@/lib/server/auth/next";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import type { LoginResponse } from "@/types/auth";

export async function POST(request: NextRequest) {
  let name = "";
  let email = "";
  let password = "";
  let role = "student";

  try {
    const body = await request.json();
    name = (body.name ?? "").trim();
    email = (body.email ?? "").trim().toLowerCase();
    password = body.password ?? "";
    role = (body.role ?? "student").toLowerCase();

    if (!["student", "teacher"].includes(role)) {
      role = "student";
    }

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const pool = getPostgresPool();

  try {
    // Check if user exists
    const existingRes = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existingRes.rows.length > 0) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }

    // Get default institution
    const instRes = await pool.query(`SELECT id FROM institutions LIMIT 1`);
    if (instRes.rows.length === 0) {
      return NextResponse.json({ error: "No institution configured" }, { status: 500 });
    }
    const institutionId = instRes.rows[0].id;

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, institution_id, email, name, role, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [userId, institutionId, email, name, role, passwordHash]
    );

    // Issue token
    const token = await issueLoginToken({
      userId,
      email,
      role: role as any,
      institutionId,
    });

    const response: LoginResponse = {
      token,
      role: role as any,
      user: {
        id: userId,
        role: role as any,
        email,
        institutionId,
      },
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error("Signup error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
