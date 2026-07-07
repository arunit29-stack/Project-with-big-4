import { storeUploadChunk } from "@/lib/api/assignmentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {

  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  storeUploadChunk(token, buffer);

  return new NextResponse(null, { status: 200 });
}
