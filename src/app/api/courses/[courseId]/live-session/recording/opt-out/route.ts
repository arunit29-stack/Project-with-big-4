import { NextResponse } from "next/server";
import { requireNextAuth } from "@/lib/server/auth/next";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId } = await params;

  return NextResponse.json({
    courseId,
    audioOptedOut: true,
    micForciblyMuted: true,
  });
}
