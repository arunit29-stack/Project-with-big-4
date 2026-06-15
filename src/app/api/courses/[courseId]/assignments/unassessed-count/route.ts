import { getTeacherUnassessedCount } from "@/lib/api/assignmentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher", "admin"]);
  if (auth instanceof Response) return auth;
  const { courseId } = await params;
  return NextResponse.json({
    count: getTeacherUnassessedCount(courseId),
  });
}
