import { z } from "zod";
import { route, withWorkspace } from "@/lib/server";
import { approveSchema } from "@/lib/schemas";
import { approveJob, rejectJob, reopenJob } from "@/lib/services/orders";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), input: approveSchema }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("reopen") }),
]);

export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const b = body.parse(await req.json());
  return withWorkspace((ws, s) => {
    if (b.action === "approve") return approveJob(ws, s, params.id, b.input);
    if (b.action === "reject") { rejectJob(ws, s, params.id); return { ok: true }; }
    reopenJob(ws, s, params.id);
    return { ok: true };
  });
});
