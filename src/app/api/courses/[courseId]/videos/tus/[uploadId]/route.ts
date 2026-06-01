import {
  finalizeTusUpload,
  getTusUpload,
  patchTusUpload,
} from "@/lib/api/contentStore";
import { NextRequest, NextResponse } from "next/server";

function tusHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Upload-Offset, Tus-Resumable",
    "Tus-Resumable": "1.0.0",
    ...extra,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: tusHeaders() });
}

export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  const { uploadId } = await params;
  const upload = getTusUpload(uploadId);
  if (!upload) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: tusHeaders({
      "Upload-Offset": String(upload.offset),
      "Upload-Length": String(upload.size),
    }),
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> },
) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { uploadId } = await params;
  const offset = Number(request.headers.get("upload-offset") ?? -1);
  const buffer = Buffer.from(await request.arrayBuffer());

  const newOffset = patchTusUpload(uploadId, buffer, offset);
  if (newOffset < 0) {
    return new NextResponse(null, { status: 404 });
  }

  const upload = getTusUpload(uploadId);
  if (upload && newOffset >= upload.size) {
    finalizeTusUpload(uploadId);
  }

  return new NextResponse(null, {
    status: 204,
    headers: tusHeaders({ "Upload-Offset": String(newOffset) }),
  });
}
