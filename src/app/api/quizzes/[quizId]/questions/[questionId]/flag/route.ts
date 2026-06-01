import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quizId: string; questionId: string }> },
) {
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
