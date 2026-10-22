import { route, withWorkspace } from "@/lib/server";
import { updateCase } from "@/lib/services/cases";

export const PATCH = route(async (req, { params }: { params: { id: string } }) => {
  const body = await req.json();
  return withWorkspace((ws, s) => ({ case: updateCase(ws, s, params.id, body) }));
});
