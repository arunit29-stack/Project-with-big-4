import { requireNextAuth } from "@/lib/server/auth/next";
import { presignPdfUpload } from "@/lib/server/library/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher"]);
  if (auth instanceof Response) return auth;

  const { courseId } = await params;
  const body = (await request.json()) as {
    week?: number;
    topic?: string;
    fileName?: string;
    size?: number;
    mimeType?: string;
  };
  if (
    typeof body.week !== "number" ||
    typeof body.topic !== "string" ||
    typeof body.fileName !== "string" ||
    typeof body.size !== "number" ||
    typeof body.mimeType !== "string"
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await presignPdfUpload({
        courseId,
        week: body.week,
        topic: body.topic,
        fileName: body.fileName,
        size: body.size,
        mimeType: body.mimeType,
      }),
    );
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
