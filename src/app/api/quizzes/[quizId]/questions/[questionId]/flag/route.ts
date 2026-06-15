import { NextResponse } from "next/server";
import { requireNextAuth } from "@/lib/server/auth/next";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quizId: string; questionId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { quizId, questionId } = await params;
  const body = (await request.json()) as { reason?: string };

  return NextResponse.json({
    quizId,
    questionId,
    reason: body.reason ?? "",
    teacherNotificationQueued: true,
    receivedAt: new Date().toISOString(),
  });
}
