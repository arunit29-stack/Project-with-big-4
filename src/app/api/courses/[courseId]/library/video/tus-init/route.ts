import { requireNextAuth } from "@/lib/server/auth/next";
import { createVideoTusSession } from "@/lib/server/library/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher"]);
  if (auth instanceof Response) return auth;
  const { courseId } = await params;
  const body = (await request.json()) as {
    fileHash?: string;
    fileName?: string;
    size?: number;
  };
  if (
    typeof body.fileHash !== "string" ||
    typeof body.fileName !== "string" ||
    typeof body.size !== "number"
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const session = await createVideoTusSession({
    courseId,
    fileHash: body.fileHash,
    fileName: body.fileName,
    size: body.size,
  });
  return NextResponse.json(
    { ...session },
    {
      headers: {
        "Upload-URL": `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/courses/${courseId}/library/video/${session.uploadId}`,
      },
    },
  );
}
