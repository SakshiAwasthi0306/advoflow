import { route, rateLimit } from "@/lib/server";
import { requireSession } from "@/lib/session";
import { intake, type IntakeItem } from "@/lib/services/intake";
import { ValidationError } from "@/lib/services/workspace";
import { usesAIService } from "@/lib/config";
import { aiAllowance } from "@/lib/ai/limits";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = route(async (req, _ctx, { requestId, startedAt }) => {
  const session = await requireSession();
  rateLimit(`process:${session.officeId}`, 20);
  const form = await req.formData();
  const items: IntakeItem[] = [];
  const text = String(form.get("text") ?? "").trim();
  if (text) text.split(/\n\s*-{3,}\s*\n/).map((t) => t.trim()).filter(Boolean).forEach((t, i) => items.push({ name: `Pasted order ${i + 1}`, text: t }));
  for (const f of form.getAll("files")) {
    if (typeof f === "string") continue;
    items.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  if (!items.length) throw new ValidationError("Paste an order or choose at least one file.");
  if (items.length > 20) throw new ValidationError("Upload up to 20 orders at a time.");
  const hint = { caseNumber: String(form.get("caseNumber") ?? "").slice(0, 80), court: String(form.get("court") ?? "").slice(0, 200), context: String(form.get("context") ?? "").slice(0, 1000) };
  if (usesAIService()) await aiAllowance(session, items.length);
  return { results: await intake(session, items, hint, { requestId, deadlineAt: startedAt + (maxDuration - 15) * 1000 }) };
});
