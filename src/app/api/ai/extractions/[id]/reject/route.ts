import { route, withWorkspace } from "@/lib/server";
import { rejectJob } from "@/lib/services/orders";

// POST /api/ai/extractions/:id/reject -> the draft is discarded; no case record changes. The document is kept.
export const POST = route(async (_req, { params }: { params: { id: string } }) => withWorkspace((ws, s) => {
  rejectJob(ws, s, params.id);
  return { ok: true, status: "rejected" };
}));
