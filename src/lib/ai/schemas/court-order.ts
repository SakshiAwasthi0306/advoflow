import { z } from "zod";

// What Gemini must return for a court order. Two forms of the same contract:
//  - COURT_ORDER_JSON_SCHEMA is sent to Gemini (structured output; the API supports a JSON Schema subset and
//    ignores string-length keywords), and
//  - courtOrderOutputSchema (Zod) re-checks every answer here, including lengths and real calendar dates.
// Passing the schema only proves the SHAPE. Facts are checked against the document in services/court-order.ts.

// Shape is strict; individual values are lenient where a bad value should become null + warning rather than
// discard the whole draft: empty strings count as null, and real-calendar-date / CNR checks happen in the service.
const emptyToNull = (v: unknown) => (typeof v === "string" && !v.trim() ? null : v);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const quote = z.preprocess(emptyToNull, z.string().max(1500).nullable());
const page = z.number().int().min(1).max(500).nullable();
const status = z.enum(["stated", "inferred", "missing"]);
const field = <T extends z.ZodTypeAny>(t: T) => z.object({ value: z.preprocess(emptyToNull, t.nullable()), status, quote, page });
const text = (max: number) => z.string().trim().min(1).max(max);

export const courtOrderOutputSchema = z.object({
  caseNumber: field(text(120)),
  cnr: field(text(40)),
  caseType: field(text(120)),
  title: field(text(300)),
  court: field(text(200)),
  courtLocation: field(text(120)),
  bench: field(text(300)),
  orderDate: field(isoDate),
  nextHearingDate: field(isoDate),
  nextHearingPurpose: field(text(160)),
  adjourned: field(z.boolean()),
  costs: field(text(300)),
  parties: z.array(z.object({ name: text(200), role: text(80), quote, page })).max(20),
  otherDates: z.array(z.object({ date: z.preprocess(emptyToNull, isoDate.nullable()), kind: z.enum(["past_hearing", "compliance_deadline", "filing", "event", "other"]), description: text(300), quote, page })).max(30),
  directions: z.array(z.object({ text: text(1500), verbatim: z.boolean(), quote, page })).max(25),
  deadlines: z.array(z.object({ action: text(300), dueDate: z.preprocess(emptyToNull, isoDate.nullable()), dueAsWritten: z.preprocess(emptyToNull, z.string().max(200).nullable()), responsible: z.preprocess(emptyToNull, z.string().max(200).nullable()), quote, page })).max(20),
  summary: z.string().trim().max(1500),
  missingOrAmbiguous: z.array(z.object({ field: text(60), explanation: text(400) })).max(20),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(text(400)).max(20),
});
export type CourtOrderOutput = z.infer<typeof courtOrderOutputSchema>;

// ---- JSON Schema (for responseJsonSchema)

const nul = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra });
const jsQuote = nul("string", { description: "Exact text copied from the document that supports the value; null if none." });
const jsPage = nul("integer", { minimum: 1, description: "Page number from '--- Page N ---' markers, if present." });
const jsField = (valueType: string, description: string, extra: Record<string, unknown> = {}) => ({
  type: "object",
  description,
  properties: {
    value: nul(valueType, extra),
    status: { type: "string", enum: ["stated", "inferred", "missing"] },
    quote: jsQuote,
    page: jsPage,
  },
  required: ["value", "status", "quote", "page"],
  additionalProperties: false,
});
const date = { format: "date", description: "YYYY-MM-DD" };

export const COURT_ORDER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    caseNumber: jsField("string", "Case number as written, e.g. O.S. No. 1234/2024."),
    cnr: jsField("string", "16-character eCourts CNR, only if printed."),
    caseType: jsField("string", "Case type as written, e.g. Original Suit, Writ Petition."),
    title: jsField("string", "Cause title, e.g. 'A v. B'."),
    court: jsField("string", "Court name as written."),
    courtLocation: jsField("string", "Place of the court."),
    bench: jsField("string", "Judge or bench, only if named."),
    orderDate: jsField("string", "Date the order was passed.", date),
    nextHearingDate: jsField("string", "Only a date the order expressly fixes for the next hearing.", date),
    nextHearingPurpose: jsField("string", "Purpose or stage for the next hearing, as stated."),
    adjourned: jsField("boolean", "Whether the matter was adjourned."),
    costs: jsField("string", "Costs imposed, as written."),
    parties: {
      type: "array", maxItems: 20,
      items: { type: "object", properties: { name: { type: "string" }, role: { type: "string" }, quote: jsQuote, page: jsPage }, required: ["name", "role", "quote", "page"], additionalProperties: false },
    },
    otherDates: {
      type: "array", maxItems: 30,
      items: {
        type: "object",
        properties: { date: nul("string", date), kind: { type: "string", enum: ["past_hearing", "compliance_deadline", "filing", "event", "other"] }, description: { type: "string" }, quote: jsQuote, page: jsPage },
        required: ["date", "kind", "description", "quote", "page"],
        additionalProperties: false,
      },
    },
    directions: {
      type: "array", maxItems: 25,
      items: { type: "object", properties: { text: { type: "string" }, verbatim: { type: "boolean" }, quote: jsQuote, page: jsPage }, required: ["text", "verbatim", "quote", "page"], additionalProperties: false },
    },
    deadlines: {
      type: "array", maxItems: 20,
      items: {
        type: "object",
        properties: { action: { type: "string" }, dueDate: nul("string", date), dueAsWritten: nul("string"), responsible: nul("string"), quote: jsQuote, page: jsPage },
        required: ["action", "dueDate", "dueAsWritten", "responsible", "quote", "page"],
        additionalProperties: false,
      },
    },
    summary: { type: "string", description: "Two or three neutral sentences; a summary, not a quotation." },
    missingOrAmbiguous: { type: "array", maxItems: 20, items: { type: "object", properties: { field: { type: "string" }, explanation: { type: "string" } }, required: ["field", "explanation"], additionalProperties: false } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    warnings: { type: "array", maxItems: 20, items: { type: "string" } },
  },
  additionalProperties: false,
  required: ["caseNumber", "cnr", "caseType", "title", "court", "courtLocation", "bench", "orderDate", "nextHearingDate", "nextHearingPurpose", "adjourned", "costs", "parties", "otherDates", "directions", "deadlines", "summary", "missingOrAmbiguous", "confidence", "warnings"],
};
