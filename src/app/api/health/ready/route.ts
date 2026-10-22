import { NextResponse } from "next/server";
import { config, configIssues } from "@/lib/config";
import { getPrisma } from "@/lib/db/prisma";
import { checkDatabase, readiness } from "@/lib/health";
import { newRequestId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { appInfo, NO_STORE } from "../info";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Readiness: 200 "ready" or 503 "not_ready". Checks configuration and a database round trip through Prisma.
export async function GET() {
  const requestId = newRequestId();
  const prisma = getPrisma();
  const databaseRequired = !!process.env.VERCEL || config.researchConnector === "opendata";
  const database = await checkDatabase(prisma ? () => prisma.$queryRaw`SELECT 1` : null, {
    timeoutMs: 3000,
    required: databaseRequired,
    onError: (e) => logger.error("readiness: database check failed", { requestId, error: e }),
  });
  const r = readiness(appInfo, configIssues, database, databaseRequired);
  return NextResponse.json({ ...r.body, requestId }, { status: r.httpStatus, headers: { ...NO_STORE, "x-request-id": requestId } });
}
