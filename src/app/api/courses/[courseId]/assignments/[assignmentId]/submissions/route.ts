import { getTeacherSubmissions } from "@/lib/api/assignmentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher", "admin"]);
  if (auth instanceof Response) return auth;

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
