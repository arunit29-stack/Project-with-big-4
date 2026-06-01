import { confirmStudentSubmission, parseUserId } from "@/lib/api/assignmentStore";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId, assignmentId } = await params;
  const userId = parseUserId(auth);

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
    userId,
    assignmentId,
    body.fileName,
    body.submissionToken,
    body.studentName ?? "Student",
  );

  return NextResponse.json({ version }, { status: 201 });
}
