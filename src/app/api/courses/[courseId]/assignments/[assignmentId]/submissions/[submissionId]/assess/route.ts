import { assessSubmission } from "@/lib/api/assignmentStore";
import type { Assessment } from "@/types/assignment";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      courseId: string;
      assignmentId: string;
      submissionId: string;
    }>;
  },
) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId, assignmentId, submissionId } = await params;

  let body: {
    assessment?: Assessment;
    waiveLatePenalty?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (!body.assessment) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  assessSubmission(
    courseId,
    assignmentId,
    submissionId,
    body.assessment,
    body.waiveLatePenalty ?? false,
  );

  return NextResponse.json({ ok: true });
}
