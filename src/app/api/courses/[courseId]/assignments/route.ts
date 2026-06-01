import {
  getStudentAssignments,
  getTeacherAssignments,
  parseUserId,
} from "@/lib/api/assignmentStore";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId } = await params;
  const role = request.nextUrl.searchParams.get("role");

  if (role === "teacher") {
    return NextResponse.json({
      assignments: getTeacherAssignments(courseId),
    });
  }

  const userId = parseUserId(auth);
  return NextResponse.json({
    assignments: getStudentAssignments(courseId, userId),
  });
}
