import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;

  return NextResponse.json({
    courseId,
    audioOptedOut: true,
    micForciblyMuted: true,
  });
}
