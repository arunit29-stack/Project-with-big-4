import { requireNextAuth } from "@/lib/server/auth/next";
import { getR2Bucket, getR2Client } from "@/lib/server/library/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher"]);
  if (auth instanceof Response) return auth;

  const { courseId } = await params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const fileName = file instanceof File ? file.name : "assignment.pdf";
  const contentType = file instanceof File ? file.type || "application/pdf" : "application/pdf";

  if (contentType !== "application/pdf") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const fileKey = `assignments/${courseId}/teacher/${randomUUID()}-${fileName}`;
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: fileKey,
      ContentType: "application/pdf",
    }),
    { expiresIn: 15 * 60 },
  );

  return NextResponse.json({ uploadUrl, fileKey, fileName });
}
