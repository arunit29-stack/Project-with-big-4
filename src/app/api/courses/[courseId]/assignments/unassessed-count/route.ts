import { getTeacherUnassessedCount } from "@/lib/api/assignmentStore";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { courseId } = await params;
  return NextResponse.json({
    count: getTeacherUnassessedCount(courseId),
  });
}
