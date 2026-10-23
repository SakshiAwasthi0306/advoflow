import { z } from "zod";
import { route, withWorkspace } from "@/lib/server";
import { approveSchema } from "@/lib/schemas";
import { rejectJob, reopenJob } from "@/lib/services/orders";
import { confirmExtraction } from "@/lib/ai/services/review";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), input: approveSchema }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("reopen") }),
]);

export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const b = body.parse(await req.json());
  return withWorkspace((ws, s) => {
    // The review screen lists every conflict next to the Approve button, so approving there acknowledges them.
    if (b.action === "approve") return confirmExtraction(ws, s, params.id, b.input, ["nextHearingDate", "court", "cnr", "title", "stage"]);
    if (b.action === "reject") { rejectJob(ws, s, params.id); return { ok: true }; }
    reopenJob(ws, s, params.id);
    return { ok: true };
  });
});
