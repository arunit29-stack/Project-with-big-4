import {
  getAnnotations,
  saveAnnotations,
} from "@/lib/api/contentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import type { PdfAnnotation } from "@/types/content";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId } = await params;
  const fileId = request.nextUrl.searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  return NextResponse.json({
    annotations: getAnnotations(courseId, auth.userId, fileId),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId } = await params;

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

  saveAnnotations(courseId, auth.userId, fileId, body.annotations);
  return NextResponse.json({ ok: true });
}
