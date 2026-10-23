// Case research through the configured AI (MOCKED OpenRouter; fictional case; demo judgment corpus).
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => {
  const saved = { ...process.env };
  process.env.GEMINI_API_KEY = "";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key-not-real";
  process.env.AUTH_MODE = "password";
  process.env.RESEARCH_CONNECTOR = "demo";
  process.env.DATABASE_URL = "";
  return { saved, fetch: vi.fn() };
});
vi.stubGlobal("fetch", h.fetch);

import { checkProvisions, fitToSchema } from "@/lib/ai/services/research";
import { aiIssueSchema } from "@/lib/schemas";
import { runResearch } from "@/lib/research/pipeline";
import { getConnector } from "@/lib/research/connectors";
import type { CaseRecord, CourtOrder } from "@/lib/types";

afterAll(() => { process.env = h.saved; vi.unstubAllGlobals(); });

const now = new Date().toISOString();
const caseRecord: CaseRecord = { id: "c1", number: "O.S. No. 615/2026", numberKey: "OS|615|2026", cnr: null, title: "Kavitha Shetty v. Mohan Gowda", parties: { petitioner: "Kavitha Shetty", respondent: "Mohan Gowda" }, court: "City Civil Judge, Bengaluru", caseType: "OS", stage: "Written statement", clientId: null, status: "active", isDemo: false, createdAt: now, updatedAt: now };
const order: CourtOrder = { id: "o1", caseId: "c1", documentId: "d1", jobId: null, orderDate: "2026-10-14", summary: "Defendant given a last chance to file the written statement, subject to costs of Rs. 500.", stage: "Written statement", adjourned: true, costs: "Rs. 500", directions: ["Defendant to file written statement on or before the next date."], nextHearingDate: "2026-10-28", nextHearingConfirmed: true, approvedFields: [], extractionSnapshot: null, approvedBy: "u1", approvedAt: now, isDemo: false };
const ORDER_TEXT = "Plaintiff's counsel present. Defendant's counsel sought further time to file written statement. Time granted as a last chance, subject to costs of Rs. 500 payable to the plaintiff. Adjourned to 28-10-2026 for written statement.";

const ANALYSIS = {
  summary: "Original suit before the City Civil Judge, Bengaluru. On 14-10-2026 the court gave the defendant a last chance to file the written statement, on costs of Rs. 500, and posted the matter to 28-10-2026.",
  issues: [
    { title: "Whether the defendant can still file a written statement after the 'last chance' order of 14-10-2026 under Order VIII Rule 1 CPC", whatOrderDecided: "Granted time as a last chance on costs of Rs. 500; did not decide the merits.", questionsNext: ["Is this a commercial dispute under s.2(1)(c) of the Commercial Courts Act, 2015, making the 120-day limit mandatory?", "When was summons served, and how many days have passed since?"], establishedFacts: ["14-10-2026: time granted as a last chance on costs of Rs. 500"], inferences: ["The court may refuse further time on 28-10-2026"], unknownFacts: ["Date of service of summons"] },
    { title: "Delay", whatOrderDecided: "—", questionsNext: [], establishedFacts: [], inferences: [], unknownFacts: [] },
  ],
  searchQueries: ["written statement last chance costs", "written statement 120 days commercial suit"],
  provisions: [
    { legislation: "Code of Civil Procedure, 1908", section: "Order VIII Rule 1", explanation: "Time for filing the written statement.", relevance: "The order turns on the defendant's delay.", factsRequired: ["Date of service"], considerations: "Stricter in commercial suits." },
    { legislation: "Code of Civil Procedure, 1908", section: "Order VIII Rule 1", explanation: "dup", relevance: "dup", factsRequired: [], considerations: "" },
    { legislation: "Indian Penal Code", section: "Section 420", explanation: "Cheating.", relevance: "If the claim alleges cheating.", factsRequired: [], considerations: "" },
    { legislation: "Specific Relief Act", section: "", explanation: "x", relevance: "x", factsRequired: [], considerations: "" },
  ],
};
const ok = (content: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 3000, completion_tokens: 1500 } }), { status: 200 });

beforeEach(() => h.fetch.mockReset());

describe("provision checks", () => {
  it("drops duplicates and provisions without a section, flags missing years and the 2024 criminal-law change", () => {
    const { provisions, warnings } = checkProvisions(ANALYSIS.provisions);
    expect(provisions.map((p) => `${p.legislation} ${p.section}`)).toEqual(["Code of Civil Procedure, 1908 Order VIII Rule 1", "Indian Penal Code Section 420"]);
    const ipc = provisions[1];
    expect(ipc.considerations).toMatch(/full name and year/);
    expect(ipc.considerations).toMatch(/BNS, BNSS and BSA replaced the IPC/);
    expect(warnings.join(" ")).toMatch(/without an Act or section/);
  });
  it("trims an over-long answer to the limits instead of throwing the memo away", () => {
    const long = { ...ANALYSIS, summary: "x".repeat(5000), issues: [{ ...ANALYSIS.issues[0], questionsNext: Array.from({ length: 12 }, (_, i) => `Question ${i}?`) }] };
    const fitted = fitToSchema(aiIssueSchema, long);
    expect(fitted.summary).toHaveLength(2000);
    expect(fitted.issues[0].questionsNext).toHaveLength(8);
  });
});

describe("research with the configured AI", () => {
  it("reads the order text, thinks harder, keeps only specific issues and builds authorities from database records only", async () => {
    const corpus = await getConnector()!.search("written statement last chance costs", 4);
    expect(corpus.length).toBeGreaterThan(0);
    const real = corpus[0];
    h.fetch
      .mockResolvedValueOnce(ok(ANALYSIS))
      .mockImplementationOnce(async () => ok({
        summary: "Memo.",
        authorities: [
          { sourceId: real.sourceId, issue: "Written statement delay", materialFacts: "From the headnote.", principle: "Time limits are directory in ordinary suits.", passageIds: [real.passages[0]?.id ?? "p1"], relevance: "On point.", distinctions: "Not a commercial suit.", stance: "supports", bindingness: "persuasive" },
          { sourceId: "INVENTED-CASE-123", issue: "x", materialFacts: "x", principle: "x", passageIds: [], relevance: "x", distinctions: "x", stance: "supports", bindingness: "binding" },
        ],
        arguments: [{ proposition: "Further time should be refused.", facts: ["Last chance on 14-10-2026"], supportIds: [real.sourceId, "INVENTED-CASE-123"], evidenceNeeded: ["Service date"], counterpoints: ["Courts lean towards hearing both sides"], limitations: "Headnote only.", verify: "Read the full judgment." }],
        counterarguments: [], missingFacts: ["Date of service"], nextSteps: [{ text: "Find the date of service from the record.", kind: "investigate" }],
      }));
    const draft = await runResearch({
      caseRecord, orders: [order], documents: [{ id: "d1", text: ORDER_TEXT, filename: "order.txt" }], question: "", actingFor: "petitioner", createdBy: "u1",
      ai: { requestId: "r", deadlineAt: Date.now() + 170_000 },
    });
    const [first, second] = h.fetch.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
    expect(first.reasoning).toEqual({ effort: "medium" });
    expect(first.response_format.json_schema.strict).toBe(true);
    expect(JSON.stringify(first.messages)).toContain("Time granted as a last chance"); // the order's own words reach the AI
    expect(second.messages[1].content[0].text).toContain(real.sourceId);
    expect(draft.pipeline).toMatch(/^openrouter:google\/gemini-3\.8-flash\/demo$/);
    expect(draft.issues.map((i) => i.title)).toEqual([ANALYSIS.issues[0].title]); // the bare topic "Delay" was dropped
    expect(draft.issues[0].questionsNext[0]).toMatch(/Commercial Courts Act, 2015/);
    expect(draft.provisions.every((p) => p.verification === "unverified" && p.origin === "ai_suggested")).toBe(true);
    expect(draft.authorities).toHaveLength(1); // the invented case was removed
    expect(draft.authorities[0]).toMatchObject({ name: real.title, citation: real.citation, court: real.court }); // from the record, not the model
    expect(draft.arguments[0].supportIds).toHaveLength(1);
    expect(draft.limitations.join(" ")).toMatch(/did not match any retrieved source/);
  });
});
