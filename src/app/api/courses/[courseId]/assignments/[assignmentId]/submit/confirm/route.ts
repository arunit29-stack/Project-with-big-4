import { requireNextAuth } from "@/lib/server/auth/next";
import { confirmSubmission } from "@/lib/server/assignments/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  const auth = await requireNextAuth(request, ["student"]);
  if (auth instanceof Response) return auth;

  const { courseId, assignmentId } = await params;
  const body = (await request.json()) as {
    fileName?: string;
    submissionToken?: string;
    studentName?: string;
  };

  if (!body.submissionToken || !body.fileName) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await confirmSubmission({
        courseId,
        assignmentId,
        studentId: auth.userId,
        fileName: body.fileName,
        submissionToken: body.submissionToken,
        studentName: body.studentName ?? "Student",
      }),
      { status: 201 },
    );
  } catch (error) {
    const message = (error as Error).message;
    if (message === "deadline_passed") {
      return NextResponse.json(
        { message: "Submission deadline has passed." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
}
