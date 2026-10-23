// Client updates in any chosen language: drafted by the AI (MOCKED OpenRouter) from confirmed facts only, checked for
// invented dates / case numbers, saved as editable drafts, never sent.
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => {
  const saved = { ...process.env };
  process.env.GEMINI_API_KEY = "";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key-not-real";
  process.env.AUTH_MODE = "password";
  return { saved, fetch: vi.fn() };
});
vi.stubGlobal("fetch", h.fetch);

import { AIError } from "@/lib/ai/errors";
import { checkDraft, confirmedFacts, draftClientUpdate, DraftExists, saveClientDraft } from "@/lib/ai/services/client-update";
import { asciiDigits, LANG_CODES, languageLabel } from "@/lib/languages";
import { clientInputSchema } from "@/lib/schemas";
import { emptyWorkspace, NotFoundError, PermissionError, ValidationError } from "@/lib/services/workspace";
import { approveJob, createJob } from "@/lib/services/orders";
import type { Session, Workspace } from "@/lib/types";

afterAll(() => { process.env = h.saved; vi.unstubAllGlobals(); });

const S: Session = { userId: "u1", officeId: "office_a", role: "owner", name: "Adv", mode: "password" };
const now = new Date().toISOString();

function office(pref: (typeof LANG_CODES)[number] | null, hearing: "confirmed" | "awaiting_verification" = "confirmed"): Workspace {
  const ws = emptyWorkspace("office_a", "Rao Chambers", []);
  if (pref) ws.clients.push({ id: "cl_1", name: "Meena", phone: "9876543210", email: "meena@example.test", preferredLanguage: pref, preferredChannel: "whatsapp", notes: "private note", isDemo: false, createdAt: now, updatedAt: now });
  ws.cases.push({ id: "case_1", number: "O.S. No. 3141/2025", numberKey: "OS|3141|2025", cnr: null, title: "Meena v. Ravi", parties: { petitioner: "Meena", respondent: "Ravi" }, court: "Senior Civil Judge, Dharwad", caseType: "OS", stage: "Written statement", clientId: pref ? "cl_1" : null, status: "active", isDemo: false, createdAt: now, updatedAt: now });
  ws.orders.push({ id: "ord_1", caseId: "case_1", documentId: "doc_1", jobId: null, orderDate: "2026-10-16", summary: "Defendant given time to file the written statement.", stage: "Written statement", adjourned: true, costs: null, directions: ["Plaintiff to file documents on or before 06-11-2026."], nextHearingDate: "2026-11-20", nextHearingConfirmed: hearing === "confirmed", approvedFields: [], extractionSnapshot: null, approvedBy: "u1", approvedAt: now, isDemo: false });
  ws.hearings.push({ id: "h_1", caseId: "case_1", date: "2026-11-20", purpose: "Written statement", status: hearing, sourceOrderId: "ord_1", supersededById: null, confirmedBy: hearing === "confirmed" ? "u1" : null, confirmedAt: null, createdAt: now });
  return ws;
}
const reply = (out: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(out) } }], usage: { prompt_tokens: 300, completion_tokens: 200 } }), { status: 200 });
const TA = { message: "வணக்கம் Meena, உங்கள் வழக்கு O.S. No. 3141/2025 குறித்து: நீதிமன்றம் விசாரணையை ஒத்திவைத்தது. அடுத்த விசாரணை 20-11-2026 அன்று. கேள்விகள் இருந்தால் அலுவலகத்தை அழைக்கவும். – Rao Chambers", englishCheck: "Hello Meena, about your case O.S. No. 3141/2025: the court adjourned the hearing. The next hearing is on 20-11-2026. Please call the office with questions. – Rao Chambers", warnings: [] };
const opts = { requestId: "r", deadlineAt: Date.now() + 60_000 };

beforeEach(() => h.fetch.mockReset());

describe("languages", () => {
  it("offers English, Kannada and other Indian languages; clients can choose any of them", () => {
    expect(LANG_CODES).toEqual(expect.arrayContaining(["en", "kn", "hi", "ta", "te", "ml", "mr", "bn", "ur"]));
    expect(clientInputSchema.parse({ name: "A", preferredLanguage: "ta" }).preferredLanguage).toBe("ta");
    expect(clientInputSchema.safeParse({ name: "A", preferredLanguage: "xx" }).success).toBe(false);
    expect(languageLabel("ta")).toBe("Tamil · தமிழ்");
  });
  it("reads digits in Indian scripts and Urdu", () => {
    expect(asciiDigits("२०-११-२०२६ / ௨௦ / ೨೦ / ২০ / ۲۰")).toBe("20-11-2026 / 20 / 20 / 20 / 20");
  });
});

describe("approval drafts follow the client's language", () => {
  const approve = (ws: Workspace) => {
    ws.orders = []; ws.hearings = [];
    const text = "IN THE COURT OF THE CITY CIVIL JUDGE, BENGALURU\nO.S. No. 3141/2025\nDate: 16-10-2026\nAdjourned to 20-11-2026 for written statement.";
    const doc = { id: "doc_x", caseId: null, filename: "o.txt", mime: "text/plain", size: 1, sha256: "shax", storageKey: "k", kind: "order" as const, textExtract: text, textSource: "pasted" as const, isDemo: false, uploadedBy: "u1", createdAt: now };
    const f = (v: string | boolean | null) => ({ value: v, status: v === null ? "missing" as const : "stated" as const, source: null });
    const ex = { caseNumber: f("O.S. No. 3141/2025"), cnr: f(null), title: f(null), court: f(null), orderDate: f("2026-10-16"), nextHearingDate: f("2026-11-20"), stage: f("Written statement"), summary: f(null), adjourned: f(true), costs: f(null), directions: [], tasks: [], clientUpdateEn: "", clientUpdateKn: "", confidence: "high" as const, warnings: [], extractor: "demo-rules" as const, model: null };
    const job = createJob(ws, S, { doc, idempotencyKey: "shax", hint: { caseNumber: "", court: "", context: "" }, extraction: ex as never, error: null }).job;
    const d = <T,>(v: T) => ({ approved: v !== null, value: v });
    approveJob(ws, S, job.id, { caseDecision: { mode: "existing", caseId: "case_1" }, fields: { orderDate: d("2026-10-16"), nextHearingDate: d("2026-11-20"), stage: d("Written statement"), summary: d(null), adjourned: d(true), costs: d(null), court: d(null), title: d(null) }, confirmHearing: true, directions: [], tasks: [] });
    return ws.clientUpdates.map((u) => u.lang).sort();
  };
  it("Tamil-speaking client: English template only (Tamil is drafted on request)", () => expect(approve(office("ta"))).toEqual(["en"]));
  it("Kannada-speaking client: English and Kannada templates", () => expect(approve(office("kn"))).toEqual(["en", "kn"]));
  it("no client linked yet: English and Kannada, as before", () => expect(approve(office(null))).toEqual(["en", "kn"]));
});

describe("AI drafting from confirmed facts", () => {
  it("sends only confirmed case facts: no phone, email, notes or unapproved drafts", async () => {
    const ws = office("ta");
    h.fetch.mockResolvedValueOnce(reply(TA));
    const d = await draftClientUpdate(ws, "case_1", "ta", opts);
    const body = JSON.parse(String((h.fetch.mock.calls[0][1] as RequestInit).body));
    const sent = JSON.stringify(body.messages);
    expect(sent).toContain("O.S. No. 3141/2025");
    expect(sent).toContain("20-11-2026");
    expect(sent).not.toMatch(/9876543210|meena@example\.test|private note/);
    expect(body.messages[0].content).toMatch(/Tamil \(தமிழ்\)/);
    expect(d).toMatchObject({ orderId: "ord_1", message: TA.message, englishCheck: TA.englishCheck, meta: { promptVersion: "client-update.v1" } });
  });

  it("refuses to draft before an order is confirmed", () => {
    const ws = office("ta");
    ws.orders = [];
    expect(() => confirmedFacts(ws, "case_1")).toThrow(ValidationError);
  });

  it.each([
    ["an invented date", { ...TA, message: TA.message.replace("20-11-2026", "27-11-2026") }],
    ["an invented date in the English check", { ...TA, englishCheck: TA.englishCheck + " Costs must be paid by 1 December 2026." }],
    ["a missing case number", { ...TA, message: "வணக்கம் Meena, அடுத்த விசாரணை 20-11-2026 அன்று. – Rao Chambers", englishCheck: "Hello Meena, the next hearing is on 20-11-2026." }],
  ])("rejects a draft with %s", async (_label, out) => {
    h.fetch.mockResolvedValueOnce(reply(out));
    const e = await draftClientUpdate(office("ta"), "case_1", "ta", opts).catch((x) => x);
    expect(e).toBeInstanceOf(AIError);
    expect(e.kind).toBe("invalid_output");
  });

  it("never gives an unconfirmed hearing date", async () => {
    h.fetch.mockResolvedValueOnce(reply(TA));
    const e = await draftClientUpdate(office("ta", "awaiting_verification"), "case_1", "ta", opts).catch((x) => x);
    expect(e).toBeInstanceOf(AIError);
    const facts = confirmedFacts(office("ta", "awaiting_verification"), "case_1").facts;
    expect(facts.nextHearingConfirmed).toBe(false);
  });

  it("accepts confirmed dates written in the language's own digits", () => {
    const f = confirmedFacts(office("hi"), "case_1").facts;
    expect(checkDraft(f, "नमस्ते Meena, आपका मामला O.S. No. ३१४१/२०२५: अगली सुनवाई २०-११-२०२६ को है।", "Hello Meena, your case O.S. No. 3141/2025: the next hearing is on 20-11-2026.")).toEqual([]);
    expect(checkDraft(f, "नमस्ते, O.S. No. ३१४१/२०२५: अगली सुनवाई २१-११-२०२६ को है।", "next hearing 21-11-2026")).not.toEqual([]);
  });
});

describe("saving drafts", () => {
  const d = { orderId: "ord_1", message: TA.message, englishCheck: TA.englishCheck };
  it("saves an editable AI draft with its English check; one per order and language", () => {
    const ws = office("ta");
    const u = saveClientDraft(ws, S, "case_1", "ta", d, false);
    expect(u).toMatchObject({ lang: "ta", status: "draft", origin: "ai", checkText: TA.englishCheck, clientId: "cl_1", sourceOrderId: "ord_1" });
    expect(() => saveClientDraft(ws, S, "case_1", "ta", d, false)).toThrow(DraftExists);
    saveClientDraft(ws, S, "case_1", "ta", { ...d, message: TA.message + " " }, true);
    expect(ws.clientUpdates).toHaveLength(1);
    u.status = "handed_off";
    expect(() => saveClientDraft(ws, S, "case_1", "ta", d, true)).toThrow(ValidationError); // a message already opened in WhatsApp is never changed
  });
  it("viewers cannot draft; another office's case is not found", () => {
    const ws = office("ta");
    expect(() => saveClientDraft(ws, { ...S, role: "viewer" }, "case_1", "ta", d, false)).toThrow(PermissionError);
    expect(() => saveClientDraft(ws, S, "case_of_other_office", "ta", d, false)).toThrow(NotFoundError);
  });
});
