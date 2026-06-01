import { NextResponse } from "next/server";
import type { ServerConfig } from "@/types/auth";

export async function GET() {
  const config: ServerConfig = {
    institutionSSOConfigured:
      process.env.INSTITUTION_SSO_CONFIGURED === "true",
    institutionName: process.env.INSTITUTION_NAME ?? "Institution",
  };

  return NextResponse.json(config);
}
