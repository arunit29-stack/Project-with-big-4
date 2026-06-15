import { createTusUpload } from "@/lib/api/contentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: tusCorsHeaders(),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireNextAuth(request, ["teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const courseId = request.nextUrl.pathname.split("/")[3];
  const uploadLength = Number(request.headers.get("upload-length") ?? 0);
  if (!uploadLength) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const uploadId = createTusUpload(courseId, uploadLength);
  const location = `${request.nextUrl.origin}/api/courses/${courseId}/videos/tus/${uploadId}`;

  return new NextResponse(null, {
    status: 201,
    headers: {
      ...tusCorsHeaders(),
      Location: location,
      "Upload-Offset": "0",
      "Tus-Resumable": "1.0.0",
    },
  });
}

function tusCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, PATCH, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Upload-Offset, Upload-Length, Content-Type, Tus-Resumable",
    "Access-Control-Expose-Headers":
      "Upload-Offset, Location, Tus-Resumable, Upload-Length",
    "Tus-Resumable": "1.0.0",
    "Tus-Version": "1.0.0",
    "Tus-Extension": "creation",
  };
}
