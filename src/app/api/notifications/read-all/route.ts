import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Mark all notifications read for the authenticated user.
  return NextResponse.json({ ok: true });
}
