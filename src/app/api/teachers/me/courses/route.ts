import {
  createTeacherCourse,
  generateCourseCode,
  getTeacherCourses,
} from "@/lib/api/courseStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireNextAuth(request, ["teacher", "admin"]);
  if (auth instanceof Response) return auth;
  return NextResponse.json({ courses: getTeacherCourses() });
}

export async function POST(request: NextRequest) {
  const auth = await requireNextAuth(request, ["teacher", "admin"]);
  if (auth instanceof Response) return auth;

  let body: {
    name?: string;
    code?: string;
    description?: string;
    enrolmentOpen?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const course = createTeacherCourse({
    name,
    code: (body.code ?? generateCourseCode()).trim().toUpperCase(),
    description: (body.description ?? "").trim(),
    enrolmentOpen: body.enrolmentOpen ?? true,
  });

  return NextResponse.json({ course }, { status: 201 });
}
