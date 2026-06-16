import { NextRequest, NextResponse } from "next/server";
import { requireNextAuth } from "@/lib/server/auth/next";

export async function DELETE(request: NextRequest) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  return NextResponse.json({ ok: true });
}
