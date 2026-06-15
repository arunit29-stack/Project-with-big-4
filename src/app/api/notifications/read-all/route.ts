import { NextRequest, NextResponse } from "next/server";
import { requireNextAuth } from "@/lib/server/auth/next";

export async function PATCH(request: NextRequest) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  // Mark all notifications read for the authenticated user.
  return NextResponse.json({ ok: true });
}
