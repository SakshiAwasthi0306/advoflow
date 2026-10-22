import { z } from "zod";
import { route, withWorkspace } from "@/lib/server";
import { researchAction } from "@/lib/services/research";
import { isValidISODate } from "@/lib/util";

const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("note"), text: z.string().max(4000) }),
  z.object({ type: z.literal("save_authority"), authorityId: z.string() }),
  z.object({ type: z.literal("bookmark_provision"), provisionId: z.string() }),
  z.object({ type: z.literal("review_authority"), authorityId: z.string() }),
  z.object({ type: z.literal("mark_reviewed") }),
  z.object({ type: z.literal("create_task"), stepId: z.string(), title: z.string().trim().min(2).max(200), dueDate: z.string().refine(isValidISODate).nullable(), confirm: z.boolean() }),
]);

export const POST = route(async (req, { params }: { params: { id: string; v: string } }) => {
  const a = action.parse(await req.json());
  return withWorkspace((ws, s) => researchAction(ws, s, params.id, Number(params.v), a));
});
