import { NextResponse } from "next/server";
import { z } from "zod";
import { usesAIService } from "@/lib/config";
import { AIError } from "@/lib/ai/errors";
import { aiAllowance } from "@/lib/ai/limits";
import { reviewView } from "@/lib/ai/services/review";
import { route } from "@/lib/server";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { intake, type IntakeItem } from "@/lib/services/intake";
import { loadWorkspace, requireRole, ValidationError } from "@/lib/services/workspace";
import { owned } from "@/lib/authz";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_AI_FILE_BYTES = 10 * 1024 * 1024; // Gemini receives scans inline; larger files are refused before upload
const MAX_TEXT_CHARS = 400_000;

const jsonBody = z.object({
  text: z.string().min(20, "Paste the text of the order (at least 20 characters).").max(MAX_TEXT_CHARS, "The text is too long."),
  caseNumber: z.string().trim().max(80).optional(),
  court: z.string().trim().max(200).optional(),
}).strict();

// POST /api/ai/extract-court-order
//   JSON { text, caseNumber?, court? }   or   multipart/form-data { file (PDF/JPG/PNG/TXT), caseNumber?, court? }
// -> 201 { extraction: <draft for review> }  (200 with reused: true when the same document was already submitted)
// Saves the original document and a PENDING REVIEW draft only. Nothing is written to any case, hearing, order or task
// until POST /api/ai/extractions/:id/confirm. Same document again = the same draft (no second AI call, no duplicate).
export const POST = route(async (req, _ctx, { requestId, startedAt }) => {
  const session = await requireSession();
  requireRole(session, "clerk");
  if (!usesAIService()) throw new AIError("not_configured");

  let item: IntakeItem;
  let hint = { caseNumber: "", court: "", context: "" };
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const f = form.get("file");
    if (!f || typeof f === "string") throw new ValidationError("Attach the order as \"file\" (PDF, JPG, PNG or plain text).");
    if (f.size > MAX_AI_FILE_BYTES) throw new ValidationError("The file is larger than 10 MB.");
    item = { name: f.name || "Uploaded order", bytes: new Uint8Array(await f.arrayBuffer()) };
    hint = { caseNumber: String(form.get("caseNumber") ?? "").slice(0, 80), court: String(form.get("court") ?? "").slice(0, 200), context: "" };
  } else {
    const b = jsonBody.parse(await req.json());
    item = { name: "Pasted order", text: b.text };
    hint = { caseNumber: b.caseNumber ?? "", court: b.court ?? "", context: "" };
  }

  await aiAllowance(session);
  const [r] = await intake(session, [item], hint, { requestId, deadlineAt: startedAt + (maxDuration - 15) * 1000, throwAIErrors: true });
  if (!r.jobId) throw new ValidationError(r.message);
  const ws = await loadWorkspace(getStore(), session);
  const job = owned.job(ws, r.jobId);
  return NextResponse.json({ requestId, reused: r.reused, message: r.message, extraction: reviewView(ws, job) }, { status: r.reused ? 200 : 201 });
});
