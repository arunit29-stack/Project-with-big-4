import { NextRequest, NextResponse } from "next/server";
import { requireNextAuth } from "@/lib/server/auth/next";

const SAMPLE_PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF",
);

export async function GET(request: NextRequest) {
  const auth = await requireNextAuth(request, [
    "student",
    "teacher",
    "admin",
  ]);
  if (auth instanceof Response) return auth;

  return new NextResponse(SAMPLE_PDF_BYTES, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="submission.pdf"',
    },
  });
}
