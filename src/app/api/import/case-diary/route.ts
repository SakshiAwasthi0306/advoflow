import { z } from "zod";
import { documents, rateLimit, route, withWorkspace } from "@/lib/server";
import { requireSession } from "@/lib/session";
import { importCaseDiary } from "@/lib/services/diary-import";

export const runtime = "nodejs";
export const maxDuration = 60;

// Body: { data: "<the value of localStorage['case-diary-v1']>" } — at most 5 MB of JSON.
export const POST = route(async (req) => {
  const session = await requireSession();
  rateLimit(`diary-import:${session.officeId}`, 5);
  const { data } = z.object({ data: z.string().min(2, "Paste the Case Diary data first.").max(5_000_000, "That export is larger than 5 MB.") }).parse(await req.json());
  const result = await withWorkspace((ws, s) => importCaseDiary(ws, s, data, (sha, bytes) => documents.put(s.officeId, sha, "txt", bytes)));
  return { result };
});
