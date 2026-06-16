import { setVideoStatus } from "@/lib/server/library/service";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; videoId: string }> },
) {
  const { courseId, videoId } = await params;
  const body = (await request.json()) as {
    status?: "uploading" | "processing" | "ready" | "failed";
  };
  if (!body.status) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const ok = await setVideoStatus({ courseId, videoId, status: body.status });
  return NextResponse.json({ ok });
}
