import { retryItem } from "@/lib/api/contentStore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; itemId: string }> },
) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId, itemId } = await params;
  retryItem(courseId, itemId);
  return NextResponse.json({ ok: true });
}
