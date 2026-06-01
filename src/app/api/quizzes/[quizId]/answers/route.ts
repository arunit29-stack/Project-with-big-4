import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quizId: string }> },
) {
  const { quizId } = await params;
  const body = (await request.json()) as {
    courseId?: string;
    questionId?: string;
    answerOptionId?: string;
    locked?: boolean;
  };

  return NextResponse.json({
    quizId,
    courseId: body.courseId,
    questionId: body.questionId,
    answerOptionId: body.answerOptionId,
    locked: true,
    savedAt: new Date().toISOString(),
  });
}
