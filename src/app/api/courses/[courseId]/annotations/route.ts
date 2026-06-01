import {
  getAnnotations,
  parseUserIdFromToken,
  saveAnnotations,
} from "@/lib/api/contentStore";
import type { PdfAnnotation } from "@/types/content";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId } = await params;
  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const userId = parseUserIdFromToken(auth);
  return NextResponse.json({
    annotations: getAnnotations(courseId, userId, fileId),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId } = await params;
  const userId = parseUserIdFromToken(auth);

  let body: { fileId?: string; annotations?: PdfAnnotation[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const fileId = body.fileId;
  if (!fileId || !Array.isArray(body.annotations)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  saveAnnotations(courseId, userId, fileId, body.annotations);
  return NextResponse.json({ ok: true });
}
