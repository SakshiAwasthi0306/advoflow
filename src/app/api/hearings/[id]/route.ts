import { z } from "zod";
import { route, withWorkspace } from "@/lib/server";
import { cancelHearing, confirmHearing } from "@/lib/services/orders";
import { isValidISODate } from "@/lib/util";

export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const b = z.object({ action: z.enum(["confirm", "cancel"]), date: z.string().refine(isValidISODate).optional() }).parse(await req.json());
  return withWorkspace((ws, s) => {
    if (b.action === "confirm") return { hearing: confirmHearing(ws, s, params.id, b.date) };
    cancelHearing(ws, s, params.id);
    return { ok: true };
  });
});
