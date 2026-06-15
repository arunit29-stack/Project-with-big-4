import { confirmStudentSubmission } from "@/lib/api/assignmentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  const auth = await requireNextAuth(request, ["student"]);
  if (auth instanceof Response) return auth;

  const { courseId, assignmentId } = await params;

  let body: {
    fileName?: string;
    submissionToken?: string;
    studentName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (!body.submissionToken || !body.fileName) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const version = confirmStudentSubmission(
    courseId,
    auth.userId,
    assignmentId,
    body.fileName,
    body.submissionToken,
    body.studentName ?? "Student",
  );

  return NextResponse.json({ version }, { status: 201 });
}
