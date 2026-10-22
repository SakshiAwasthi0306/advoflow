import { route, withWorkspace } from "@/lib/server";
import { upsertClient } from "@/lib/services/cases";

export const POST = route(async (req) => {
  const body = await req.json();
  return withWorkspace((ws, s) => ({ client: upsertClient(ws, s, body) }));
});
