import { z } from "zod";
import { documents, route, withWorkspace } from "@/lib/server";
import { clearDemo, seedDemo } from "@/lib/demo/seed";
import { ValidationError } from "@/lib/services/workspace";

export const POST = route(async (req) => {
  const { action } = z.object({ action: z.enum(["load", "clear"]) }).parse(await req.json());
  return withWorkspace(async (ws, s) => {
    if (action === "clear") { clearDemo(ws, s); return { ok: true }; }
    if (ws.demoLoaded) throw new ValidationError("The demo workspace is already loaded.");
    await seedDemo(ws, s, (sha, bytes) => documents.put(s.officeId, sha, "txt", bytes));
    return { ok: true };
  });
});
