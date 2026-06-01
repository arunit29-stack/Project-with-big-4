import {
  createTeacherCourse,
  generateCourseCode,
  getTeacherCourses,
} from "@/lib/api/courseStore";
import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return unauthorized();
  }
  return NextResponse.json({ courses: getTeacherCourses() });
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return unauthorized();
  }

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
