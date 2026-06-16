import { handleLogoutRequest } from "@/lib/server/auth/next";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return handleLogoutRequest(request);
}