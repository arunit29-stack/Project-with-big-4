import { getCourseDetail } from "@/lib/api/courseStore";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId } = await params;
  const role = request.nextUrl.searchParams.get("role") as
    | "student"
    | "teacher"
    | null;

  if (role !== "student" && role !== "teacher") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  const course = getCourseDetail(courseId, role);
  if (!course) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ course });
}
