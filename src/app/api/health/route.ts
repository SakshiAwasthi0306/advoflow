import { NextResponse } from "next/server";
import { configIssues } from "@/lib/config";
import { liveness } from "@/lib/health";
import { appInfo, NO_STORE } from "./info";

export const dynamic = "force-dynamic";

// Liveness: always 200 while the process is up. "degraded" means the configuration needs attention (see checks.config).
export function GET() {
  return NextResponse.json(liveness(appInfo, configIssues), { headers: NO_STORE });
}
