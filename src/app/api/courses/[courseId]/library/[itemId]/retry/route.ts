import { retryItem } from "@/lib/api/contentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; itemId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId, itemId } = await params;
  retryItem(courseId, itemId);
  return NextResponse.json({ ok: true });
}
