import {
  getAssignment,
  getStudentAssignment,
  parseUserId,
} from "@/lib/api/assignmentStore";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId, assignmentId } = await params;
  const role = request.nextUrl.searchParams.get("role");

  if (role === "teacher") {
    const assignment = getAssignment(courseId, assignmentId);
    if (!assignment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ assignment });
  }

  const userId = parseUserId(auth);
  const item = getStudentAssignment(courseId, userId, assignmentId);
  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(item);
}
