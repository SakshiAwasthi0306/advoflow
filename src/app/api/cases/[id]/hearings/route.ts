import { z } from "zod";
import { route, withWorkspace } from "@/lib/server";
import { addHearing } from "@/lib/services/orders";
import { isValidISODate, todayIST } from "@/lib/dates";

// POST /api/cases/:id/hearings { date, purpose?, confirmed? } -> { hearing }
// Office and role come from the session; another office's case answers 404.
const body = z.object({
  date: z.string().refine(isValidISODate, "Enter a real date."),
  purpose: z.string().trim().max(160).default(""),
  confirmed: z.boolean().default(false),
}).strict();

export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const b = body.parse(await req.json());
  return withWorkspace((ws, s) => ({ hearing: addHearing(ws, s, params.id, b, todayIST()) }));
});
