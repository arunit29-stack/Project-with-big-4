import {
  getStudentAssignments,
  getTeacherAssignments,
} from "@/lib/api/assignmentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId } = await params;
  if (auth.role === "teacher" || auth.role === "admin") {
    return NextResponse.json({
      assignments: getTeacherAssignments(courseId),
    });
  }

  return NextResponse.json({
    assignments: getStudentAssignments(courseId, auth.userId),
  });
}
