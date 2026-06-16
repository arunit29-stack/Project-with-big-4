import { handleLogoutRequest } from "@/lib/server/auth/next";
import { NextRequest } from "next/server";

/**
 * EXIT_ON_CLOSE session teardown endpoint.
 * Receives token via sendBeacon body (fire-and-forget from client).
 */
export async function POST(request: NextRequest) {
  return handleLogoutRequest(request);
}
