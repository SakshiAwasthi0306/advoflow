import { z } from "zod";
import { rateLimit, route, withWorkspace } from "@/lib/server";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { loadWorkspace, requireRole } from "@/lib/services/workspace";
import { owned } from "@/lib/authz";
import { researchRunSchema } from "@/lib/schemas";
import { runResearch } from "@/lib/research/pipeline";
import { saveResearchVersion } from "@/lib/services/research";
import { usesAIService } from "@/lib/config";
import { aiAllowance } from "@/lib/ai/limits";

export const runtime = "nodejs";
export const maxDuration = 180; // two AI steps (analysis, then judgments) with more thinking than order reading
const body = researchRunSchema.extend({ actingFor: z.enum(["petitioner", "respondent", "unspecified"]).default("unspecified") });

export const POST = route(async (req, _ctx, { requestId, startedAt }) => {
  const session = await requireSession();
  requireRole(session, "advocate");
  rateLimit(`research:${session.officeId}`, 6);
  const input = body.parse(await req.json());
  const ws = await loadWorkspace(getStore(), session);
  const c = owned.case(ws, input.caseId);
  // Only advocate-approved orders from THIS case can inform research.
  const orders = ws.orders.filter((o) => o.caseId === c.id && input.orderIds.includes(o.id));
  // The selected orders' own documents are always included, so the research reads the court's words, not only the summary.
  const docIds = new Set([...input.documentIds, ...orders.map((o) => o.documentId)]);
  const docs = ws.documents.filter((d) => d.caseId === c.id && docIds.has(d.id)).map((d) => ({ id: d.id, text: d.textExtract, filename: d.filename }));
  if (usesAIService()) await aiAllowance(session, 2);
  const draft = await runResearch({
    caseRecord: c, orders, documents: docs, question: input.question, actingFor: input.actingFor, createdBy: session.userId,
    ai: { requestId, deadlineAt: startedAt + (maxDuration - 15) * 1000 },
  });
  const { report, version } = await withWorkspace((w, s) => saveResearchVersion(w, s, c.id, draft, input.reportId));
  return { reportId: report.id, version: version.version };
});
