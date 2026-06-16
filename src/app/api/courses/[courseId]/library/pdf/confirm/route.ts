import { requireNextAuth } from "@/lib/server/auth/next";
import { confirmPdfUpload } from "@/lib/server/library/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher"]);
  if (auth instanceof Response) return auth;

  const { courseId } = await params;
  const body = (await request.json()) as {
    fileId?: string;
    week?: number;
    topic?: string;
    fileName?: string;
  };
  if (
    typeof body.fileId !== "string" ||
    typeof body.week !== "number" ||
    typeof body.topic !== "string" ||
    typeof body.fileName !== "string"
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const ok = await confirmPdfUpload({
    courseId,
    fileId: body.fileId,
    week: body.week,
    topic: body.topic,
    fileName: body.fileName,
  });
  return NextResponse.json({ ok, indexQueued: ok });
}
