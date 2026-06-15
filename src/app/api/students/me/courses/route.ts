import {
  findStudentCourseByCode,
  getStudentCourses,
} from "@/lib/api/courseStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";
import type { StudentCourse } from "@/types/course";

export async function GET(request: NextRequest) {
  const auth = await requireNextAuth(request, ["student"]);
  if (auth instanceof Response) return auth;
  return NextResponse.json({ courses: getStudentCourses() });
}

export async function POST(request: NextRequest) {
  const auth = await requireNextAuth(request, ["student"]);
  if (auth instanceof Response) return auth;

  let code: string;
  try {
    const body = (await request.json()) as { code?: string };
    code = body.code ?? "";
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const course = findStudentCourseByCode(code);
  if (!course) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ course } satisfies { course: StudentCourse });
}
