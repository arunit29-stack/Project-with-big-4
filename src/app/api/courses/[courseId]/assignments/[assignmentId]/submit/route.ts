import { requireNextAuth } from "@/lib/server/auth/next";
import { createSubmissionPresign } from "@/lib/server/assignments/service";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  const auth = await requireNextAuth(request, ["student"]);
  if (auth instanceof Response) return auth;

  const { courseId, assignmentId } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const fileName = file instanceof File ? file.name : "submission.pdf";
  const contentType = file instanceof File ? file.type || "application/pdf" : "application/pdf";

  try {
    return NextResponse.json(
      await createSubmissionPresign({
        courseId,
        assignmentId,
        studentId: auth.userId,
        fileName,
        contentType,
      }),
    );
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { error: message === "not_found" ? "not_found" : "invalid" },
      { status: 400 },
    );
  }
}
