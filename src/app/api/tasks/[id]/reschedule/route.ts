import { z } from "zod";
import { route, withWorkspace } from "@/lib/server";
import { resolveReschedule } from "@/lib/services/orders";

export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const { action } = z.object({ action: z.enum(["move", "keep"]) }).parse(await req.json());
  return withWorkspace((ws, s) => resolveReschedule(ws, s, params.id, action));
});
