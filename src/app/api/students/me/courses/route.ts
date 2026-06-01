import {
  findStudentCourseByCode,
  getStudentCourses,
} from "@/lib/api/courseStore";
import { NextRequest, NextResponse } from "next/server";
import type { StudentCourse } from "@/types/course";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return unauthorized();
  }
  return NextResponse.json({ courses: getStudentCourses() });
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return unauthorized();
  }

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
