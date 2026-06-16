import { requireNextAuth } from "@/lib/server/auth/next";
import { buildLibraryTree } from "@/lib/server/library/service";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;
  const { courseId } = await params;
  try {
    return NextResponse.json({
      weeks: await buildLibraryTree(courseId, auth.role, auth.userId),
    });
  } catch (error) {
    if ((error as Error).message === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
