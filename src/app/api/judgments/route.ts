import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/server";
import { requireSession } from "@/lib/session";
import { config } from "@/lib/config";
import { createOpenDataConnector, OPEN_DATA_ATTRIBUTION } from "@/lib/research/connectors";
import { hitLimit } from "@/lib/rate-limit";
import { errorJson, newRequestId } from "@/lib/http";

export const dynamic = "force-dynamic";

const query = z.object({ q: z.string().trim().min(2, "Search for at least two characters.").max(300), limit: z.coerce.number().int().min(1).max(20).default(10) });
const connector = createOpenDataConnector(() => config.databaseUrl);

// GET /api/judgments?q=...&limit=10 — the shared, read-only corpus of real judgments (public.legal_judgments).
// Same data for every office and stored apart from office records; signed-in users only, to limit scraping.
export const GET = route(async (req) => {
  const s = await requireSession();
  await hitLimit("judgments", s.userId, 60, 60);
  const { q, limit } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const ok = await connector.available();
  if (!ok.ok) return errorJson(503, "SERVICE_UNAVAILABLE", "The judgments database is not available here.", newRequestId());
  const results = await connector.search(q, limit);
  return NextResponse.json({ results, attribution: OPEN_DATA_ATTRIBUTION }, { headers: { "Cache-Control": "private, max-age=60" } });
});
