import { NextResponse } from "next/server";
import { z } from "zod";
import { usesAIService } from "@/lib/config";
import { AIError } from "@/lib/ai/errors";
import { aiAllowance } from "@/lib/ai/limits";
import { DraftExists, confirmedFacts, draftClientUpdate, saveClientDraft } from "@/lib/ai/services/client-update";
import { owned } from "@/lib/authz";
import { LANG_CODES } from "@/lib/languages";
import { route, withWorkspace } from "@/lib/server";
import { getStore } from "@/lib/store";
import { requireSession } from "@/lib/session";
import { loadWorkspace, requireRole } from "@/lib/services/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

const body = z.object({ caseId: z.string().min(1).max(64), lang: z.enum(LANG_CODES), replace: z.boolean().default(false) }).strict();

// POST /api/ai/client-updates { caseId, lang, replace? }
// -> 201 { update }: an EDITABLE DRAFT in the chosen language, written by the AI from the case's confirmed facts only,
//    with an English rendering (checkText) for languages other than English. Nothing is sent.
//    409 when a draft in that language exists for the latest order (send replace: true to redraft it).
export const POST = route(async (req, _ctx, { requestId, startedAt }) => {
  const session = await requireSession();
  requireRole(session, "clerk");
  if (!usesAIService()) throw new AIError("not_configured");
  const b = body.parse(await req.json());
  const ws = await loadWorkspace(getStore(), session);
  owned.case(ws, b.caseId); // 404 for another office's case, before anything is sent to the AI
  const { orderId } = confirmedFacts(ws, b.caseId);
  const existing = ws.clientUpdates.find((u) => u.caseId === b.caseId && u.sourceOrderId === orderId && u.lang === b.lang);
  if (existing && !b.replace) return NextResponse.json({ error: new DraftExists(existing.id).message, code: "CONFLICT", requestId, existingId: existing.id }, { status: 409 }); // no AI call wasted
  await aiAllowance(session);
  const draft = await draftClientUpdate(ws, b.caseId, b.lang, { requestId, deadlineAt: startedAt + (maxDuration - 10) * 1000 });
  try {
    const update = await withWorkspace((w, s) => saveClientDraft(w, s, b.caseId, b.lang, draft, b.replace));
    return NextResponse.json({ requestId, update, warnings: draft.warnings, ai: draft.meta }, { status: 201 });
  } catch (e) {
    if (e instanceof DraftExists) return NextResponse.json({ error: e.message, code: "CONFLICT", requestId, existingId: e.existingId }, { status: 409 });
    throw e;
  }
});
