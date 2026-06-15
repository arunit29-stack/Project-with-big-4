import { NextResponse } from "next/server";
import { requireNextAuth } from "@/lib/server/auth/next";

export async function POST(request: Request) {
  const auth = await requireNextAuth(request, ["student"]);
  if (auth instanceof Response) return auth;

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
