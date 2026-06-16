import { requireNextAuth } from "@/lib/server/auth/next";
import { deleteLibraryFile } from "@/lib/server/library/service";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; fileId: string }> },
) {
  const auth = await requireNextAuth(request, ["teacher"]);
  if (auth instanceof Response) return auth;

  const { courseId, fileId } = await params;
  const ok = await deleteLibraryFile(courseId, fileId);
  return NextResponse.json({ ok });
}
