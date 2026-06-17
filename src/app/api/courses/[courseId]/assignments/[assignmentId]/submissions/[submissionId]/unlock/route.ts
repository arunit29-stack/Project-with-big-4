import { requireNextAuth } from "@/lib/server/auth/next";
import { unlockSubmission } from "@/lib/server/assignments/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      courseId: string;
      assignmentId: string;
      submissionId: string;
    }>;
  },
) {
  const auth = await requireNextAuth(request, ["teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId, assignmentId, submissionId } = await params;
  try {
    const ok = await unlockSubmission({
      courseId,
      assignmentId,
      submissionId,
      teacherId: auth.userId,
    });
    if (!ok) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
