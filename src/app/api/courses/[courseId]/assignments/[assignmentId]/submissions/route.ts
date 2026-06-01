import { getTeacherSubmissions } from "@/lib/api/assignmentStore";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId, assignmentId } = await params;
  const pendingOnly =
    request.nextUrl.searchParams.get("pendingOnly") === "true";

  return NextResponse.json({
    submissions: getTeacherSubmissions(
      courseId,
      assignmentId,
      pendingOnly,
    ),
  });
}
