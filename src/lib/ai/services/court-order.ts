import "server-only";
import { aiModel, config } from "../../config";
import { isValidISODate, parseIndianDate } from "../../dates";
import type { AIUsage, ExtractedField, Extraction, OrderDetails, ProposedTask } from "../../types";
import { slugKey } from "../../util";
import { AIError } from "../errors";
import { currentProvider, generate, parseJson } from "../client";
import { COURT_ORDER_EXTRACT_SYSTEM, COURT_ORDER_EXTRACT_VERSION, TRANSCRIBE_SYSTEM, courtOrderExtractUser } from "../prompts/court-order";
import { COURT_ORDER_JSON_SCHEMA, courtOrderOutputSchema, type CourtOrderOutput } from "../schemas/court-order";

// Court-order extraction with Gemini (directly or through OpenRouter). The model proposes; this file checks. Every "stated" value must be backed by
// a quote that really occurs in the document, and every date must be readable in its own quote. Anything that
// fails is downgraded or set to null with a warning. The result is always an unverified draft for human review.

export interface AIOptions {
  requestId: string;
  /** Absolute time (ms) by which all AI work must be finished. */
  deadlineAt: number;
}

export type ScanMime = "application/pdf" | "image/png" | "image/jpeg";

/** Read a scan or photo into text (with page markers) so the extraction can be checked against it. */
export async function transcribeDocument(bytes: Uint8Array, mime: ScanMime, opts: AIOptions): Promise<{ text: string; usage: AIUsage }> {
  const r = await generate({
    task: "court-order.transcribe", requestId: opts.requestId, deadlineAt: opts.deadlineAt, system: TRANSCRIBE_SYSTEM,
    parts: [{ file: { mime, base64: Buffer.from(bytes).toString("base64"), filename: mime === "application/pdf" ? "order.pdf" : "order-page" } }, { text: "Transcribe this court order." }],
    maxOutputTokens: Math.max(config.ai.maxOutputTokens, 16_384),
  });
  return { text: r.text.trim(), usage: r.usage };
}

/** Text in, reviewed draft out. Throws AIError (never a partial result) if Gemini fails or answers badly. */
export async function extractCourtOrder(
  sourceText: string,
  hint: { caseNumber?: string; court?: string },
  opts: AIOptions & { inputKind: "text" | "file"; priorUsage?: AIUsage },
): Promise<Extraction> {
  const limit = config.ai.maxInputChars;
  const text = sourceText.slice(0, limit);
  const r = await generate({
    task: "court-order.extract", requestId: opts.requestId, deadlineAt: opts.deadlineAt,
    system: COURT_ORDER_EXTRACT_SYSTEM, parts: [{ text: courtOrderExtractUser(text, hint) }], jsonSchema: COURT_ORDER_JSON_SCHEMA,
  });
  const parsed = courtOrderOutputSchema.safeParse(parseJson(r.text));
  if (!parsed.success) throw new AIError("invalid_output", `schema:${parsed.error.issues[0]?.path.join(".") ?? "?"}`);
  const ex = draftFromOutput(parsed.data, text);
  if (sourceText.length > limit) ex.warnings.unshift(`Only the first ${limit.toLocaleString("en-IN")} characters of this document were read. Check the rest of the order yourself.`);
  const p = opts.priorUsage;
  const provider = currentProvider();
  ex.extractor = provider;
  ex.ai = {
    provider, model: r.model, promptVersion: COURT_ORDER_EXTRACT_VERSION, requestId: opts.requestId, inputKind: opts.inputKind, verified: false,
    usage: p
      ? { inputTokens: sum(p.inputTokens, r.usage.inputTokens), outputTokens: sum(p.outputTokens, r.usage.outputTokens), thoughtsTokens: sum(p.thoughtsTokens, r.usage.thoughtsTokens), attempts: p.attempts + r.usage.attempts, ms: p.ms + r.usage.ms }
      : r.usage,
  };
  ex.model = r.model;
  return ex;
}
const sum = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

// ---- checking the draft against the document (pure; unit-tested)

const KANNADA_DIGITS = "೦೧೨೩೪೫೬೭೮೯";
export function norm(s: string): string {
  return s
    .replace(/[೦-೯]/g, (d) => String(KANNADA_DIGITS.indexOf(d)))
    .replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
const compact = (s: string) => norm(s).replace(/[^a-z0-9ಀ-೿]/g, "");

/** Is this quote really in the document? Whitespace, quote marks and dashes are ignored; long quotes must match their opening. */
export function quoteInDocument(q: string | null, docNorm: string): boolean {
  if (!q) return false;
  const n = norm(q);
  if (n.length < 4) return false;
  return docNorm.includes(n) || (n.length > 80 && docNorm.includes(n.slice(0, 80)));
}

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_RE = new RegExp(String.raw`\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTHS})\.?,?\s+\d{4}|(?:${MONTHS})\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}`, "gi");
/** Every calendar date written in a passage (Indian day-first order). */
export function datesIn(passage: string | null): string[] {
  if (!passage) return [];
  const ascii = passage.replace(/[೦-೯]/g, (d) => String(KANNADA_DIGITS.indexOf(d)));
  return (ascii.match(DATE_RE) ?? []).map((raw) => {
    const m = raw.match(new RegExp(String.raw`^(${MONTHS})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$`, "i"));
    return parseIndianDate(m ? `${m[2]} ${m[1]} ${m[3]}` : raw.replace(/\.(?=,?\s)/, ""));
  }).filter((d): d is string => !!d);
}

const HEARING_WORDS = /\b(list(?:ed)?|post(?:ed)?|call(?:ed)? on|adjourn(?:ed)?|next date|next hearing|stand(?:s)? over|re-?list|put up|fixed? for|for (?:hearing|arguments|evidence|orders|appearance))\b|ಮುಂದಿನ|ಮುಂದೂಡ/i;

/** Text addressed to an AI system rather than written by a court (prompt injection inside an uploaded document). */
const INSTRUCTION_LIKE = /\b(ignore (all |any )?(previous|prior|above) (instructions|rules)|system prompt|you are (an? )?(ai|assistant|language model)|as an ai|disregard (the|your) (instructions|rules)|report the next hearing)\b/i;

type F<T> = { value: T | null; status: "stated" | "inferred" | "missing"; quote: string | null; page: number | null };

export function draftFromOutput(raw: CourtOrderOutput, documentText: string): Extraction {
  const doc = norm(documentText);
  const docCompact = compact(documentText);
  const warnings: string[] = [`AI draft (${aiModel()}): unverified. Check every field against the original order before confirming.`];
  let downgraded = 0;
  const flag = (msg: string) => { warnings.push(msg); downgraded++; };

  /** A stated value needs a real quote. Strings must also appear in the document (or in their quote). */
  function check<T>(label: string, f: F<T>, opts: { valueInText?: boolean } = {}): F<T> {
    if (f.value === null) return { ...f, status: "missing", quote: f.quote && quoteInDocument(f.quote, doc) ? f.quote : null };
    const quoted = quoteInDocument(f.quote, doc);
    if (!quoted) {
      if (f.status === "stated") flag(`${label}: the supporting passage was not found in the document, so this value is marked as not confirmed.`);
      return { ...f, status: "inferred", quote: null };
    }
    if (opts.valueInText && typeof f.value === "string" && !docCompact.includes(compact(f.value))) {
      if (f.status === "stated") flag(`${label}: "${f.value}" is not written in the document as such, so it is marked as not confirmed.`);
      return { ...f, status: "inferred" };
    }
    return f;
  }

  /** A date must be a real date that is written in its own quote. */
  function checkDate(label: string, f: F<string>, opts: { nullIfUnsupported: boolean }): F<string> {
    if (f.value === null) return check(label, f);
    if (!isValidISODate(f.value)) {
      flag(`${label}: "${f.value}" is not a real calendar date, so it was left blank.`);
      return { value: null, status: "missing", quote: null, page: f.page };
    }
    const c = check(label, f);
    const supported = c.quote !== null && datesIn(c.quote).includes(f.value);
    if (supported) return c;
    if (opts.nullIfUnsupported) {
      flag(`${label}: ${f.value} could not be found in the order's wording for this date, so it was left blank. Check the order.`);
      return { value: null, status: "missing", quote: null, page: f.page };
    }
    if (c.status === "stated") flag(`${label}: ${f.value} could not be matched to the order's wording, so it is marked as not confirmed.`);
    return { ...c, status: "inferred" };
  }

  const caseNumber = check("Case number", raw.caseNumber, { valueInText: true });
  let cnr = check("CNR", raw.cnr, { valueInText: true });
  if (cnr.value && !/^[A-Z]{4}\d{12}$/i.test(cnr.value.replace(/\s|-/g, ""))) {
    flag(`CNR: "${cnr.value}" is not a 16-character CNR, so it was left blank.`);
    cnr = { value: null, status: "missing", quote: null, page: null };
  } else if (cnr.value) cnr = { ...cnr, value: cnr.value.replace(/\s|-/g, "").toUpperCase() };
  const title = check("Cause title", raw.title);
  const court = check("Court", raw.court, { valueInText: true });
  const courtLocation = check("Court location", raw.courtLocation, { valueInText: true });
  const caseType = check("Case type", raw.caseType);
  const bench = check("Judge / bench", raw.bench, { valueInText: true });
  const orderDate = checkDate("Order date", raw.orderDate, { nullIfUnsupported: false });
  let nextHearingDate = checkDate("Next hearing date", raw.nextHearingDate, { nullIfUnsupported: true });
  if (INSTRUCTION_LIKE.test(documentText)) warnings.push("This document contains text that looks like instructions to an AI system. It was treated as document content only; check the draft with extra care.");
  // A next hearing date must be fixed by hearing wording, and come after the order.
  if (nextHearingDate.value) {
    if (INSTRUCTION_LIKE.test(nextHearingDate.quote ?? "")) {
      flag(`Next hearing date: the passage for ${nextHearingDate.value} reads like an instruction to an AI, not a court direction, so it was left blank.`);
      nextHearingDate = { value: null, status: "missing", quote: null, page: null };
    } else if (!HEARING_WORDS.test(nextHearingDate.quote ?? "")) {
      flag(`Next hearing date: the passage for ${nextHearingDate.value} does not say the matter is listed or adjourned to that date, so it was left blank.`);
      nextHearingDate = { value: null, status: "missing", quote: null, page: null };
    } else if (orderDate.value && nextHearingDate.value <= orderDate.value) {
      flag(`Next hearing date: ${nextHearingDate.value} is not after the order date (${orderDate.value}), so it was left blank.`);
      nextHearingDate = { value: null, status: "missing", quote: null, page: null };
    }
  }
  const purpose = check("Next stage", raw.nextHearingPurpose);
  const adjourned = check("Adjourned", raw.adjourned);
  const costs = check("Costs", raw.costs);

  const parties: OrderDetails["parties"] = [];
  for (const p of raw.parties) {
    if (!docCompact.includes(compact(p.name))) { flag(`A party name ("${p.name}") is not written in the document and was removed.`); continue; }
    parties.push({ name: p.name, role: p.role, source: quoteInDocument(p.quote, doc) ? p.quote : null, page: p.page });
  }
  const otherDates: OrderDetails["otherDates"] = raw.otherDates.map((d) => {
    const q = quoteInDocument(d.quote, doc) ? d.quote : null;
    const ok = d.date !== null && isValidISODate(d.date) && datesIn(q).includes(d.date);
    if (d.date && !ok) flag(`The date ${d.date} ("${d.description.slice(0, 80)}") could not be matched to the order's wording and was left blank.`);
    return { date: ok ? d.date : null, kind: d.kind, description: d.description, source: q, page: d.page };
  });
  const directions: OrderDetails["directions"] = raw.directions.map((d) => {
    const q = quoteInDocument(d.quote, doc) ? d.quote : null;
    const verbatim = d.verbatim && quoteInDocument(d.text, doc);
    if (d.verbatim && !verbatim) flag(`A direction was presented as the court's exact words but does not match the order text; it is shown as a summary instead.`);
    return { text: d.text, verbatim, source: q, page: d.page };
  });
  const deadlines: OrderDetails["deadlines"] = raw.deadlines.map((d) => {
    const q = quoteInDocument(d.quote, doc) ? d.quote : null;
    const ok = d.dueDate !== null && isValidISODate(d.dueDate) && datesIn(q).includes(d.dueDate);
    if (d.dueDate && !ok) flag(`Deadline "${d.action.slice(0, 80)}": the date ${d.dueDate} is not written in its passage, so no due date was set.`);
    return { action: d.action, dueDate: ok ? d.dueDate : null, dueAsWritten: d.dueAsWritten, responsible: d.responsible, source: q, page: d.page };
  });

  for (const m of raw.missingOrAmbiguous) warnings.push(`Missing or unclear — ${m.field}: ${m.explanation}`);
  for (const w of raw.warnings) warnings.push(w);

  const asField = <T,>(f: F<T>): ExtractedField<T> => ({ value: f.value, status: f.status, source: f.quote, page: f.page });
  const tasks: ProposedTask[] = deadlines.map((d) => {
    const beforeNext = /next (date|hearing)/i.test(d.dueAsWritten ?? "");
    const dueDate = d.dueDate ?? (beforeNext ? nextHearingDate.value : null);
    return {
      key: slugKey(d.action), title: d.action.slice(0, 200), dueDate,
      dueBasis: d.dueDate ? "stated_in_order" : beforeNext && dueDate ? "next_hearing" : "none",
      priority: dueDate ? "high" : "normal", source: d.source,
    };
  });

  // Our checks can only lower the model's own confidence, never raise it.
  const confidence = downgraded > 0 ? "low" : raw.confidence === "high" && raw.missingOrAmbiguous.length > 0 ? "medium" : raw.confidence;
  return {
    caseNumber: asField(caseNumber), cnr: asField(cnr), title: asField(title), court: asField(court),
    orderDate: asField(orderDate), nextHearingDate: asField(nextHearingDate), stage: asField(purpose),
    summary: { value: raw.summary || null, status: raw.summary ? "inferred" : "missing", source: null }, // a summary, never a quotation
    adjourned: asField(adjourned), costs: asField(costs),
    directions: directions.map((d) => (d.verbatim ? `“${d.text}”` : d.text)), // quotation marks only around the court's exact words
    tasks, clientUpdateEn: "", clientUpdateKn: "", // client messages are written from APPROVED facts at confirmation
    confidence, warnings, extractor: config.aiProvider === "openrouter" ? "openrouter" : "gemini", model: aiModel(),
    details: { courtLocation: asField(courtLocation), caseType: asField(caseType), bench: asField(bench), parties, otherDates, directions, deadlines, missingOrAmbiguous: raw.missingOrAmbiguous },
  };
}
