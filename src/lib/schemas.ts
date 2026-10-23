import { z } from "zod";
import { isValidISODate } from "./util";
import { LANG_CODES } from "./languages";

const isoDate = z.string().refine(isValidISODate, "Must be a real date in YYYY-MM-DD form");

const field = <T extends z.ZodTypeAny>(t: T) =>
  z.object({ value: t.nullable(), status: z.enum(["stated", "inferred", "missing"]), source: z.string().nullable() });

/** Shape the AI must return. Anything else is rejected and the job is marked failed (retryable). */
export const aiExtractionSchema = z.object({
  caseNumber: field(z.string().min(1)),
  cnr: field(z.string()),
  title: field(z.string()),
  court: field(z.string()),
  orderDate: field(isoDate),
  nextHearingDate: field(isoDate),
  stage: field(z.string()),
  summary: field(z.string()),
  adjourned: field(z.boolean()),
  costs: field(z.string()),
  directions: z.array(z.string()).max(20),
  tasks: z
    .array(
      z.object({
        title: z.string().min(2).max(200),
        dueDate: isoDate.nullable(),
        dueBasis: z.enum(["stated_in_order", "next_hearing", "none"]),
        priority: z.enum(["high", "normal"]),
        source: z.string().nullable(),
      }),
    )
    .max(15),
  clientUpdateEn: z.string().max(1200),
  clientUpdateKn: z.string().max(2000),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string()).max(20),
});
export type AIExtraction = z.infer<typeof aiExtractionSchema>;

const fieldDecision = <T extends z.ZodTypeAny>(t: T) => z.object({ approved: z.boolean(), value: t.nullable() });

export const approveSchema = z.object({
  caseDecision: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), caseId: z.string().min(1) }),
    z.object({
      mode: z.literal("new"),
      number: z.string().trim().min(1, "Case number is required"),
      title: z.string().trim().default(""),
      court: z.string().trim().default(""),
      caseType: z.string().trim().default(""),
    }),
  ]),
  fields: z.object({
    orderDate: fieldDecision(isoDate),
    nextHearingDate: fieldDecision(isoDate),
    stage: fieldDecision(z.string().max(120)),
    summary: fieldDecision(z.string().max(2000)),
    adjourned: fieldDecision(z.boolean()),
    costs: fieldDecision(z.string().max(200)),
    court: fieldDecision(z.string().max(200)),
    title: fieldDecision(z.string().max(300)),
  }),
  confirmHearing: z.boolean(),
  directions: z.array(z.string().max(500)).max(20),
  tasks: z
    .array(
      z.object({
        key: z.string(),
        approved: z.boolean(),
        title: z.string().trim().min(2).max(200),
        dueDate: isoDate.nullable(),
        priority: z.enum(["high", "normal", "low"]),
      }),
    )
    .max(20),
});
export type ApproveInput = z.infer<typeof approveSchema>;

export const caseInputSchema = z.object({
  number: z.string().trim().min(1, "Case number is required").max(80),
  cnr: z.string().trim().max(20).optional().default(""),
  petitioner: z.string().trim().max(200).default(""),
  respondent: z.string().trim().max(200).default(""),
  court: z.string().trim().max(200).default(""),
  caseType: z.string().trim().max(80).default(""),
  stage: z.string().trim().max(120).default(""),
  clientId: z.string().nullable().optional(),
  allowDuplicate: z.boolean().optional(),
});

export const taskInputSchema = z.object({
  caseId: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).default(""),
  dueDate: isoDate.nullable(),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
});

export const clientInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).nullable().default(null),
  email: z.string().trim().email().nullable().or(z.literal("").transform(() => null)).default(null),
  preferredLanguage: z.enum(LANG_CODES).default("en"),
  preferredChannel: z.enum(["whatsapp", "phone", "email"]).default("whatsapp"),
  notes: z.string().max(2000).default(""),
});

export const researchRunSchema = z.object({
  caseId: z.string().min(1),
  reportId: z.string().optional(),
  question: z.string().trim().max(1000).default(""),
  orderIds: z.array(z.string()).max(20),
  documentIds: z.array(z.string()).max(20).default([]),
});

// What the research model returns in the two steps of the live pipeline.
export const aiIssueSchema = z.object({
  summary: z.string().max(2000),
  issues: z
    .array(
      z.object({
        title: z.string().max(200),
        whatOrderDecided: z.string().max(1000),
        questionsNext: z.array(z.string().max(300)).max(8),
        establishedFacts: z.array(z.string().max(400)).max(12),
        inferences: z.array(z.string().max(400)).max(8),
        unknownFacts: z.array(z.string().max(300)).max(10),
      }),
    )
    .max(5),
  searchQueries: z.array(z.string().max(160)).max(6),
  provisions: z
    .array(
      z.object({
        legislation: z.string().max(200),
        section: z.string().max(120),
        explanation: z.string().max(800),
        relevance: z.string().max(800),
        factsRequired: z.array(z.string().max(300)).max(8),
        considerations: z.string().max(600),
      }),
    )
    .max(8),
});

export const aiSynthesisSchema = z.object({
  summary: z.string().max(2500),
  authorities: z
    .array(
      z.object({
        sourceId: z.string(),
        issue: z.string().max(400),
        materialFacts: z.string().max(800),
        principle: z.string().max(1000),
        passageIds: z.array(z.string()).max(6),
        relevance: z.string().max(800),
        distinctions: z.string().max(800),
        stance: z.enum(["supports", "limits", "contradicts"]),
        bindingness: z.enum(["binding", "persuasive", "unknown"]),
      }),
    )
    .max(12),
  arguments: z
    .array(
      z.object({
        proposition: z.string().max(600),
        facts: z.array(z.string().max(300)).max(8),
        supportIds: z.array(z.string()).max(8),
        evidenceNeeded: z.array(z.string().max(300)).max(8),
        counterpoints: z.array(z.string().max(300)).max(6),
        limitations: z.string().max(500),
        verify: z.string().max(500),
      }),
    )
    .max(6),
  counterarguments: z.array(z.object({ point: z.string().max(600), authorityIds: z.array(z.string()).max(6), risk: z.string().max(500) })).max(6),
  missingFacts: z.array(z.string().max(300)).max(12),
  nextSteps: z.array(z.object({ text: z.string().max(400), kind: z.enum(["read", "verify", "investigate", "evidence", "procedure"]) })).max(10),
});
