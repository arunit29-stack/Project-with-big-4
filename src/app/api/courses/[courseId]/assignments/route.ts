import {
  createAssignment,
  listStudentAssignments,
  listTeacherAssignments,
} from "@/lib/server/assignments/service";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId } = await params;
  if (auth.role === "teacher" || auth.role === "admin") {
    return NextResponse.json({
      assignments: await listTeacherAssignments(courseId, auth.userId),
    });
  }

  return NextResponse.json({
    assignments: await listStudentAssignments(courseId, auth.userId),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher"]);
  if (auth instanceof Response) return auth;

  const { courseId } = await params;
  const body = (await request.json()) as {
    title?: string;
    description?: string;
    deadlineUtc?: string;
    fileKey?: string | null;
    fileName?: string | null;
    rubric?: Array<{ criterion?: string; descriptor?: string; maxMarks?: number }>;
    latePolicy?: {
      type?: "percentage_per_day" | "hard_cutoff";
      deductionPercent?: number;
    };
  };

  if (
    typeof body.title !== "string" ||
    typeof body.description !== "string" ||
    typeof body.deadlineUtc !== "string" ||
    !Array.isArray(body.rubric) ||
    !body.latePolicy?.type
  ) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const rubric = body.rubric.map((criterion, index) => ({
    id: `criterion-${index + 1}`,
    title: criterion.criterion ?? "",
    descriptor: criterion.descriptor ?? "",
    maxMarks: Number(criterion.maxMarks ?? 0),
  }));

  const assignment = await createAssignment({
    courseId,
    teacherId: auth.userId,
    title: body.title,
    description: body.description,
    deadlineUtc: body.deadlineUtc,
    rubric,
    fileKey: body.fileKey,
    fileName: body.fileName,
    latePolicy:
      body.latePolicy.type === "percentage_per_day"
        ? {
            type: "percentage_per_day",
            deductionPercent: body.latePolicy.deductionPercent ?? 0,
          }
        : { type: "hard_cutoff" },
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
