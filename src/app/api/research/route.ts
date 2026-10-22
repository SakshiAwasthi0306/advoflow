import { z } from "zod";
import { rateLimit, route, withWorkspace } from "@/lib/server";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { loadWorkspace, NotFoundError, requireRole } from "@/lib/services/workspace";
import { researchRunSchema } from "@/lib/schemas";
import { runResearch } from "@/lib/research/pipeline";
import { saveResearchVersion } from "@/lib/services/research";

export const maxDuration = 120;
const body = researchRunSchema.extend({ actingFor: z.enum(["petitioner", "respondent", "unspecified"]).default("unspecified") });

export const POST = route(async (req) => {
  const session = requireSession();
  requireRole(session, "advocate");
  rateLimit(`research:${session.officeId}`, 6);
  const input = body.parse(await req.json());
  const ws = await loadWorkspace(getStore(), session);
  const c = ws.cases.find((x) => x.id === input.caseId);
  if (!c) throw new NotFoundError("Case not found");
  // Only advocate-approved orders from THIS case can inform research.
  const orders = ws.orders.filter((o) => o.caseId === c.id && input.orderIds.includes(o.id));
  const docs = ws.documents.filter((d) => d.caseId === c.id && input.documentIds.includes(d.id)).map((d) => ({ id: d.id, text: d.textExtract, filename: d.filename }));
  const draft = await runResearch({ caseRecord: c, orders, documents: docs, question: input.question, actingFor: input.actingFor, createdBy: session.userId });
  const { report, version } = await withWorkspace((w, s) => saveResearchVersion(w, s, c.id, draft, input.reportId));
  return { reportId: report.id, version: version.version };
});
