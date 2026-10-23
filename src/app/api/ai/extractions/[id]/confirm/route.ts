import { z } from "zod";
import { owned } from "@/lib/authz";
import { confirmExtraction, reviewView } from "@/lib/ai/services/review";
import { approveSchema } from "@/lib/schemas";
import { route, withWorkspace } from "@/lib/server";

// POST /api/ai/extractions/:id/confirm
//   { confirm: true, input: <the advocate's decisions: approved/edited fields, tasks, case>, acknowledgeDifferences?: [...] }
// Writes ONLY the approved fields (as edited) to the case, order, hearing and task records, in one transaction, and
// records the reviewer, time, source document and accepted/edited/rejected per field. Advocates and owners only.
// A confirmed hearing date or a differing court/CNR is never changed silently: 409 with the differences until the
// reviewer acknowledges them. Confirming twice returns the first result.
const body = z.object({
  confirm: z.literal(true, { errorMap: () => ({ message: "Explicit confirmation (confirm: true) is required." }) }),
  input: approveSchema,
  acknowledgeDifferences: z.array(z.enum(["nextHearingDate", "court", "cnr", "title", "stage"])).max(5).default([]),
}).strict();

export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const b = body.parse(await req.json());
  return withWorkspace((ws, s) => {
    const result = confirmExtraction(ws, s, params.id, b.input, b.acknowledgeDifferences);
    return { ...result, extraction: reviewView(ws, owned.job(ws, params.id)) };
  });
});
