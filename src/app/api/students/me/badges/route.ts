import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    badge?: string;
    courseId?: string;
    quizId?: string;
  };

  return NextResponse.json({
    badge: body.badge,
    courseId: body.courseId,
    quizId: body.quizId,
    persistedToProfile: true,
    awardedAt: new Date().toISOString(),
  });
}
