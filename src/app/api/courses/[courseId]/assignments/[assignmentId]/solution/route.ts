import { requireNextAuth } from "@/lib/server/auth/next";
import { attachSolutionsToAssignment } from "@/lib/server/assignments/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher"]);
  if (auth instanceof Response) return auth;

  const { courseId, assignmentId } = await params;
  const body = (await request.json()) as {
    solutionKey?: string;
    solutionName?: string;
  };

  if (!body.solutionKey || !body.solutionName) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const success = await attachSolutionsToAssignment({
      courseId,
      assignmentId,
      teacherId: auth.userId,
      solutionKey: body.solutionKey,
      solutionName: body.solutionName,
    });
    if (!success) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
