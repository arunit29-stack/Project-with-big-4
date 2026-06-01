import { NextResponse } from "next/server";

const SAMPLE_PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF",
);

export async function GET() {
  return new NextResponse(SAMPLE_PDF_BYTES, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="submission.pdf"',
    },
  });
}
