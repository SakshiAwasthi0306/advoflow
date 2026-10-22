import { route, withWorkspace } from "@/lib/server";
import { upsertClient } from "@/lib/services/cases";

export const PATCH = route(async (req, { params }: { params: { id: string } }) => {
  const body = await req.json();
  return withWorkspace((ws, s) => ({ client: upsertClient(ws, s, body, params.id) }));
});
