import "server-only";
import { z } from "zod";
import { aiIssueSchema, aiSynthesisSchema } from "../../schemas";
import { AIError } from "../errors";
import { generate, parseJson } from "../client";
import { RESEARCH_ANALYSE_SYSTEM, RESEARCH_ANALYSE_VERSION, RESEARCH_SYNTHESISE_SYSTEM, RESEARCH_SYNTHESISE_VERSION } from "../prompts/research";
import { RESEARCH_ANALYSE_JSON_SCHEMA, RESEARCH_SYNTHESISE_JSON_SCHEMA } from "../schemas/research";

// Case research with the configured AI (Gemini directly or through OpenRouter). Two steps: analyse the case
// (issues, research questions, provisions, search queries), then synthesise the judgments actually retrieved from
// the database. Judgment names, citations and dates always come from the database record, never from the model
// (see src/lib/research/pipeline.ts). Every answer is validated; provisions are checked for obvious problems.

export interface AIOptions { requestId: string; deadlineAt: number }
const TIMEOUT_MS = 70_000; // research thinks harder than extraction

/**
 * Validate an answer, trimming over-long text and lists to the schema's limits instead of discarding the whole memo.
 * Anything else that does not fit the schema (wrong types, missing fields) is rejected.
 */
function fit<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  for (let round = 0; round < 6; round++) {
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    let fixed = false;
    for (const issue of parsed.error.issues) {
      if (issue.code !== "too_big" || (issue.type !== "string" && issue.type !== "array")) continue;
      const path = issue.path;
      let parent: unknown = raw;
      for (const k of path.slice(0, -1)) parent = (parent as Record<string | number, unknown>)?.[k];
      const last = path[path.length - 1];
      const holder = path.length ? (parent as Record<string | number, unknown>) : null;
      const v = holder ? holder[last] : raw;
      if (holder && (typeof v === "string" || Array.isArray(v))) { holder[last] = v.slice(0, Number(issue.maximum)); fixed = true; }
    }
    if (!fixed) throw new AIError("invalid_output", `schema:${parsed.error.issues[0]?.path.join(".") ?? "?"}`);
  }
  throw new AIError("invalid_output", "schema:unfixable");
}

export type Analysis = z.infer<typeof aiIssueSchema> & { warnings: string[] };

const OLD_CRIMINAL = /\b(Indian Penal Code|I\.?P\.?C\.?|Code of Criminal Procedure|Cr\.?\s?P\.?C\.?|Indian Evidence Act)\b/i;
const NEW_CRIMINAL = /Bharatiya (Nyaya|Nagarik Suraksha|Sakshya)/i;

/** Plain checks a person would make on a list of cited provisions. */
export { fit as fitToSchema };

export function checkProvisions(provisions: Analysis["provisions"]): { provisions: Analysis["provisions"]; warnings: string[] } {
  const warnings: string[] = [];
  const out: Analysis["provisions"] = [];
  const seen = new Set<string>();
  for (const p of provisions) {
    const legislation = p.legislation.trim();
    const section = p.section.trim();
    if (!legislation || !section) { warnings.push("A suggested provision without an Act or section number was left out."); continue; }
    const key = `${legislation.toLowerCase()}|${section.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let considerations = p.considerations;
    if (!/\b(1[89]\d\d|20\d\d)\b/.test(legislation)) considerations = `${considerations}${considerations ? " " : ""}Check the full name and year of this Act.`.trim();
    if (OLD_CRIMINAL.test(legislation) && !NEW_CRIMINAL.test(legislation)) {
      considerations = `${considerations} The BNS, BNSS and BSA replaced the IPC, CrPC and Evidence Act from 1 July 2024: confirm which regime applies from the date of the offence or proceeding.`.trim();
    }
    out.push({ ...p, legislation, section, considerations });
  }
  return { provisions: out, warnings };
}

export async function analyseCase(data: string, question: string, opts: AIOptions): Promise<Analysis & { usage: { model: string; promptVersion: string } }> {
  const r = await generate({
    task: "research.analyse", requestId: opts.requestId, deadlineAt: opts.deadlineAt, timeoutMs: TIMEOUT_MS, reasoning: "medium",
    system: RESEARCH_ANALYSE_SYSTEM, jsonSchema: RESEARCH_ANALYSE_JSON_SCHEMA, maxOutputTokens: 8_192,
    parts: [{ text: `Research question from the advocate: ${question.trim() || "(none given: analyse the latest order and what must be done before the next date)"}\n<data>\n${data}\n</data>` }],
  });
  const a = fit(aiIssueSchema, parseJson(r.text));
  const issues = a.issues.filter((i) => i.title.trim() && i.title.trim().split(/\s+/).length >= 4); // a bare topic is not an issue
  const { provisions, warnings } = checkProvisions(a.provisions);
  if (issues.length < a.issues.length) warnings.push("An issue without a specific statement was left out.");
  return { ...a, issues, provisions, warnings, usage: { model: r.model, promptVersion: RESEARCH_ANALYSE_VERSION } };
}

export async function synthesise(caseData: string, issues: unknown, sources: unknown, actingFor: string, opts: AIOptions) {
  const r = await generate({
    task: "research.synthesise", requestId: opts.requestId, deadlineAt: opts.deadlineAt, timeoutMs: TIMEOUT_MS, reasoning: "medium",
    system: RESEARCH_SYNTHESISE_SYSTEM, jsonSchema: RESEARCH_SYNTHESISE_JSON_SCHEMA, maxOutputTokens: 10_240,
    parts: [{ text: `Acting for: ${actingFor}\n<issues>${JSON.stringify(issues)}</issues>\n<case>${caseData}</case>\n<sources>${JSON.stringify(sources)}</sources>` }],
  });
  return { ...fit(aiSynthesisSchema, parseJson(r.text)), promptVersion: RESEARCH_SYNTHESISE_VERSION, model: r.model };
}
