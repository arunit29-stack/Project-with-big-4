import {
  getAssignment,
  getStudentAssignment,
} from "@/lib/api/assignmentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId, assignmentId } = await params;
  if (auth.role === "teacher" || auth.role === "admin") {
    const assignment = getAssignment(courseId, assignmentId);
    if (!assignment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ assignment });
  }

  const item = getStudentAssignment(courseId, auth.userId, assignmentId);
  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(item);
}
