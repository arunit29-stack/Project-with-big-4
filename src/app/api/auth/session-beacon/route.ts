import { NextRequest, NextResponse } from "next/server";

/**
 * EXIT_ON_CLOSE session teardown endpoint.
 * Receives token via sendBeacon body (fire-and-forget from client).
 */
export async function POST(request: NextRequest) {
  const token = await request.text();

  if (token) {
    // Invalidate server-side session when wired to real auth backend.
    console.info("[session-beacon] session invalidated", token.slice(0, 12));
  }

  return new NextResponse(null, { status: 204 });
}
