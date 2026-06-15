import {
  addVideoNote,
  getVideoNotes,
} from "@/lib/api/contentStore";
import { requireNextAuth } from "@/lib/server/auth/next";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; videoId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId, videoId } = await params;
  return NextResponse.json({ notes: getVideoNotes(courseId, auth.userId, videoId) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; videoId: string }> },
) {
  const auth = await requireNextAuth(request, ["student", "teacher", "admin"]);
  if (auth instanceof Response) return auth;

  const { courseId, videoId } = await params;

  let body: { timestamp?: number; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (typeof body.timestamp !== "number" || !body.text?.trim()) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const note = addVideoNote(courseId, auth.userId, videoId, {
    timestamp: body.timestamp,
    text: body.text.trim(),
  });

  return NextResponse.json({ note }, { status: 201 });
}
