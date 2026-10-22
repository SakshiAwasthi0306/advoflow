import { route, withWorkspace } from "@/lib/server";
import { updateTask } from "@/lib/services/cases";

export const PATCH = route(async (req, { params }: { params: { id: string } }) => {
  const body = await req.json();
  return withWorkspace((ws, s) => ({ task: updateTask(ws, s, params.id, body) }));
});
