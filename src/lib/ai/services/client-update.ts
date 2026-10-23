import "server-only";
import { z } from "zod";
import { aiModel } from "../../config";
import { language, asciiDigits, type LangCode } from "../../languages";
import { currentHearing, latestOrder } from "../../services/orders";
import { NotFoundError, ValidationError } from "../../services/workspace";
import type { AIUsage, Workspace } from "../../types";
import { AIError } from "../errors";
import { generate, parseJson } from "../client";
import { CLIENT_UPDATE_VERSION, clientUpdateSystem } from "../prompts/client-update";
import { datesIn as datesInWords } from "./court-order";
import { owned } from "../../authz";
import { audit, requireRole } from "../../services/workspace";
import type { ClientUpdate, Session } from "../../types";
import { newId, nowISO } from "../../util";

// Client updates in any supported language, drafted by the AI from CONFIRMED facts only: the case record, the latest
// order as the advocate approved it, and the current hearing with its confirmation status. Nothing unapproved (AI
// drafts, pending reviews), no other cases and no client contact details are sent. The result is an editable draft;
// nothing is ever sent. A draft that mentions a date or case number that is not in the facts is rejected.

const dmy = (iso: string) => iso.split("-").reverse().join("-");

export interface ClientFacts {
  clientName: string | null;
  officeName: string;
  caseNumber: string;
  caseTitle: string;
  court: string;
  order: { date: string | null; adjourned: boolean; stage: string; summary: string; directions: string[] };
  nextHearingDate: string | null;
  nextHearingConfirmed: boolean;
}

/** The confirmed facts for a case, in the form sent to the AI. */
export function confirmedFacts(ws: Workspace, caseId: string): { facts: ClientFacts; orderId: string } {
  const c = ws.cases.find((x) => x.id === caseId && x.status !== "archived");
  if (!c) throw new NotFoundError("Case not found");
  const o = latestOrder(ws, c.id);
  if (!o) throw new ValidationError("Confirm an order for this case first: client updates are written only from approved order details.");
  const h = currentHearing(ws, c.id);
  const client = ws.clients.find((x) => x.id === c.clientId) ?? null;
  const next = h?.date ?? (o.nextHearingDate && o.nextHearingConfirmed ? o.nextHearingDate : null);
  return {
    orderId: o.id,
    facts: {
      clientName: client?.name ?? null,
      officeName: ws.office.name,
      caseNumber: c.number,
      caseTitle: c.title,
      court: c.court,
      order: { date: o.orderDate ? dmy(o.orderDate) : null, adjourned: o.adjourned, stage: o.stage, summary: o.summary, directions: o.directions.slice(0, 10) },
      nextHearingDate: next ? dmy(next) : null,
      nextHearingConfirmed: h ? h.status === "confirmed" : !!(o.nextHearingDate && o.nextHearingConfirmed),
    },
  };
}

const outputSchema = z.object({
  message: z.string().trim().min(20).max(1500),
  englishCheck: z.string().trim().min(10).max(2000),
  warnings: z.array(z.string().trim().min(1).max(300)).max(10),
});
const JSON_SCHEMA = {
  type: "object",
  properties: { message: { type: "string" }, englishCheck: { type: "string" }, warnings: { type: "array", items: { type: "string" } } },
  required: ["message", "englishCheck", "warnings"],
  additionalProperties: false,
};

const DATE_RE = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;
/** Dates as DD-MM-YYYY: numeric in any script, plus English month names ("20 November 2026"). */
function datesIn(s: string): string[] {
  const ascii = asciiDigits(s);
  const out: string[] = [];
  for (const m of ascii.matchAll(DATE_RE)) out.push(m[4] ? `${m[6]}-${m[5]}-${m[4]}` : `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}-${m[3]}`);
  for (const iso of datesInWords(ascii)) if (!out.includes(dmy(iso))) out.push(dmy(iso));
  return out;
}
const compact = (s: string) => asciiDigits(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Checks that need no language skills: every date is a confirmed one, the case number is intact, no date when unconfirmed. */
export function checkDraft(f: ClientFacts, message: string, englishCheck: string): string[] {
  const problems: string[] = [];
  const allowed = new Set([f.order.date, f.nextHearingDate, ...f.order.directions.flatMap(datesIn)].filter(Boolean) as string[]);
  for (const d of [...datesIn(message), ...datesIn(englishCheck)]) if (!allowed.has(d)) problems.push(`mentions ${d}, which is not in the confirmed facts`);
  if (!f.nextHearingConfirmed && f.nextHearingDate && (datesIn(message).includes(f.nextHearingDate) || datesIn(englishCheck).includes(f.nextHearingDate))) {
    problems.push("gives a next hearing date that is not yet confirmed");
  }
  const num = compact(f.caseNumber).replace(/^[a-z]+/, ""); // the digits/year part survives any script
  if (num && !compact(message).includes(num) && !compact(englishCheck).includes(compact(f.caseNumber))) problems.push("does not mention the case number");
  return problems;
}

export async function draftClientUpdate(ws: Workspace, caseId: string, lang: LangCode, opts: { requestId: string; deadlineAt: number }) {
  const { facts, orderId } = confirmedFacts(ws, caseId);
  const l = language(lang);
  const r = await generate({
    task: "client-update.draft", requestId: opts.requestId, deadlineAt: opts.deadlineAt,
    system: clientUpdateSystem(l.name, l.native), jsonSchema: JSON_SCHEMA, maxOutputTokens: 4_096,
    parts: [{ text: `<facts>\n${JSON.stringify(facts, null, 2)}\n</facts>` }],
  });
  const parsed = outputSchema.safeParse(parseJson(r.text));
  if (!parsed.success) throw new AIError("invalid_output", `schema:${parsed.error.issues[0]?.path.join(".") ?? "?"}`);
  const problems = checkDraft(facts, parsed.data.message, parsed.data.englishCheck);
  if (problems.length) throw new AIError("invalid_output", `client_update_check:${problems.length}`); // never offer a draft with invented facts
  return {
    orderId,
    message: parsed.data.message,
    englishCheck: lang === "en" ? null : parsed.data.englishCheck,
    warnings: parsed.data.warnings,
    meta: { model: aiModel(), promptVersion: CLIENT_UPDATE_VERSION, usage: r.usage satisfies AIUsage },
  };
}

export class DraftExists extends Error {
  constructor(readonly existingId: string) {
    super("A draft in this language already exists for the latest order. Edit it, or ask for a new draft with replace: true.");
    this.name = "DraftExists";
  }
}

/** Save an AI draft as an editable client update (never sent). One draft per order and language. */
export function saveClientDraft(
  ws: Workspace, session: Session, caseId: string, lang: LangCode,
  d: { orderId: string; message: string; englishCheck: string | null }, replace: boolean,
): ClientUpdate {
  requireRole(session, "clerk");
  const c = owned.case(ws, caseId);
  const existing = ws.clientUpdates.find((u) => u.caseId === c.id && u.sourceOrderId === d.orderId && u.lang === lang);
  if (existing) {
    if (existing.status === "handed_off") throw new ValidationError("The update in this language for the latest order was already opened in WhatsApp; it is kept as it was.");
    if (!replace) throw new DraftExists(existing.id);
    Object.assign(existing, { text: d.message, checkText: d.englishCheck, origin: "ai", updatedAt: nowISO() });
    audit(ws, session, "client_update.ai_redrafted", "client_update", existing.id, c.id, lang);
    return existing;
  }
  const u: ClientUpdate = {
    id: newId("cu"), caseId: c.id, clientId: c.clientId, lang, text: d.message, status: "draft", sourceOrderId: d.orderId,
    createdAt: nowISO(), updatedAt: nowISO(), handedOffAt: null, origin: "ai", checkText: d.englishCheck,
  };
  ws.clientUpdates.push(u);
  audit(ws, session, "client_update.ai_drafted", "client_update", u.id, c.id, lang);
  return u;
}
