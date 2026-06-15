import { createPresign } from "@/lib/api/assignmentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; assignmentId: string }> },
) {
  const auth = await requireNextAuth(request, ["student"]);
  if (auth instanceof Response) return auth;

  await params;
  let body: { fileName?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const fileName = body.fileName ?? "submission.pdf";
  const fileKey = `submissions/${Date.now()}-${fileName}`;
  const { uploadUrl, token } = createPresign(fileKey);

  return NextResponse.json({
    uploadUrl,
    fileKey,
    submissionToken: token,
  });
}
