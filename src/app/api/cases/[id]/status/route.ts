import { z } from "zod";
import { route, withWorkspace } from "@/lib/server";
import { setCaseStatus } from "@/lib/services/cases";

export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const { status } = z.object({ status: z.enum(["active", "closed", "archived"]) }).parse(await req.json());
  return withWorkspace((ws, s) => setCaseStatus(ws, s, params.id, status));
});
