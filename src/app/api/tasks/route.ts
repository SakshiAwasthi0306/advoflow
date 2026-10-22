import { route, withWorkspace } from "@/lib/server";
import { createTask } from "@/lib/services/cases";

export const POST = route(async (req) => {
  const body = await req.json();
  return withWorkspace((ws, s) => ({ task: createTask(ws, s, body) }));
});
