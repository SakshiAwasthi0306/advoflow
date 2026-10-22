import { route, withWorkspace } from "@/lib/server";
import { createCase } from "@/lib/services/cases";

export const POST = route(async (req) => {
  const body = await req.json();
  return withWorkspace((ws, s) => ({ case: createCase(ws, s, body) }));
});
