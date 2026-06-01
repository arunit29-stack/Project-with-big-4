import {
  addVideoNote,
  getVideoNotes,
  parseUserIdFromToken,
} from "@/lib/api/contentStore";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; videoId: string }> },
) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId, videoId } = await params;
  const userId = parseUserIdFromToken(auth);
  return NextResponse.json({ notes: getVideoNotes(courseId, userId, videoId) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courseId: string; videoId: string }> },
) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { courseId, videoId } = await params;
  const userId = parseUserIdFromToken(auth);

  let body: { timestamp?: number; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (typeof body.timestamp !== "number" || !body.text?.trim()) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const note = addVideoNote(courseId, userId, videoId, {
    timestamp: body.timestamp,
    text: body.text.trim(),
  });

  return NextResponse.json({ note }, { status: 201 });
}
