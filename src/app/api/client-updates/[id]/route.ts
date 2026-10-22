import { z } from "zod";
import { route, withWorkspace } from "@/lib/server";
import { editClientUpdate } from "@/lib/services/cases";

export const PATCH = route(async (req, { params }: { params: { id: string } }) => {
  const b = z.object({ text: z.string().max(2000).optional(), status: z.enum(["draft", "approved", "handed_off"]).optional() }).parse(await req.json());
  return withWorkspace((ws, s) => ({ update: editClientUpdate(ws, s, params.id, b) }));
});
