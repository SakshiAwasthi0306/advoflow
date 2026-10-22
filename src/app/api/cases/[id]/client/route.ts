import { z } from "zod";
import { route, withWorkspace } from "@/lib/server";
import { linkClient } from "@/lib/services/cases";

export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const { clientId } = z.object({ clientId: z.string().nullable() }).parse(await req.json());
  return withWorkspace((ws, s) => linkClient(ws, s, params.id, clientId));
});
