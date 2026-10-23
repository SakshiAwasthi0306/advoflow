// Court-order extraction through OpenRouter with a MOCKED fetch (no network, no real key, fictional documents).
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => {
  const saved = { ...process.env };
  process.env.GEMINI_API_KEY = "";
  process.env.OPENROUTER_API_KEY = "test-openrouter-key-not-real";
  process.env.AUTH_MODE = "password";
  process.env.APP_URL = "https://advoflow.example.test";
  return { saved, fetch: vi.fn() };
});
vi.stubGlobal("fetch", h.fetch);

import { AIError } from "@/lib/ai/errors";
import { generate } from "@/lib/ai/client";
import { extractCourtOrder, transcribeDocument } from "@/lib/ai/services/court-order";
import { config } from "@/lib/config";

afterAll(() => { process.env = h.saved; vi.unstubAllGlobals(); });

const ORDER = `IN THE COURT OF THE PRINCIPAL CIVIL JUDGE, MYSURU
O.S. No. 77/2026
Lakshmi Devi ... Plaintiff
v.
Gopal Shetty ... Defendant
Date: 07-10-2026
Summons served on the defendant. Defendant absent. Defendant placed ex parte.
Call on 21-10-2026 for plaintiff's evidence.`;

const fld = (value: unknown, quote: string | null) => ({ value, status: value === null ? "missing" : "stated", quote, page: null });
const OUT = {
  caseNumber: fld("O.S. No. 77/2026", "O.S. No. 77/2026"), cnr: fld(null, null), caseType: fld(null, null),
  title: fld("Lakshmi Devi v. Gopal Shetty", "Lakshmi Devi ... Plaintiff"), court: fld("Principal Civil Judge, Mysuru", "IN THE COURT OF THE PRINCIPAL CIVIL JUDGE, MYSURU"),
  courtLocation: fld("Mysuru", "PRINCIPAL CIVIL JUDGE, MYSURU"), bench: fld(null, null),
  orderDate: fld("2026-10-07", "Date: 07-10-2026"), nextHearingDate: fld("2026-10-21", "Call on 21-10-2026 for plaintiff's evidence."),
  nextHearingPurpose: fld("Plaintiff's evidence", "Call on 21-10-2026 for plaintiff's evidence."), adjourned: fld(true, "Call on 21-10-2026 for plaintiff's evidence."), costs: fld(null, null),
  parties: [{ name: "Lakshmi Devi", role: "Plaintiff", quote: null, page: null }, { name: "Gopal Shetty", role: "Defendant", quote: null, page: null }],
  otherDates: [], directions: [{ text: "Defendant placed ex parte.", verbatim: true, quote: "Defendant placed ex parte.", page: null }], deadlines: [],
  summary: "The defendant was absent after service and was placed ex parte; the matter is posted for the plaintiff's evidence.",
  missingOrAmbiguous: [], confidence: "high", warnings: [],
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (content: unknown, finish = "stop") => reply({ choices: [{ finish_reason: finish, message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 900, completion_tokens: 400, completion_tokens_details: { reasoning_tokens: 30 } } });
const run = () => extractCourtOrder(ORDER, {}, { requestId: "req-or", deadlineAt: Date.now() + 60_000, inputKind: "text" });
const kindOf = (p: Promise<unknown>) => p.then(() => "resolved", (e) => (e instanceof AIError ? e.kind : `other:${(e as Error).message}`));

beforeEach(() => h.fetch.mockReset());

describe("OpenRouter adapter", () => {
  it("sends a private, schema-enforced request to the configured Gemini model and returns a checked draft", async () => {
    expect(config.aiProvider).toBe("openrouter");
    h.fetch.mockResolvedValueOnce(ok(OUT));
    const ex = await run();
    const [url, init] = h.fetch.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-openrouter-key-not-real");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("google/gemini-3.8-flash");
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "court_order", strict: true } });
    expect(body.provider).toEqual({ data_collection: "deny", zdr: true, require_parameters: true });
    expect(body.max_tokens).toBe(config.ai.maxOutputTokens);
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(JSON.stringify(body)).not.toContain("test-openrouter-key-not-real"); // key only in the Authorization header
    expect(ex).toMatchObject({ extractor: "openrouter", model: "google/gemini-3.8-flash" });
    expect(ex.ai).toMatchObject({ provider: "openrouter", verified: false, usage: { inputTokens: 900, outputTokens: 400, thoughtsTokens: 30, attempts: 1 } });
    expect(ex.nextHearingDate).toMatchObject({ value: "2026-10-21", status: "stated" });
    expect(ex.directions).toEqual(["“Defendant placed ex parte.”"]);
  });

  it("sends scans as files read by the model itself (no third-party OCR)", async () => {
    h.fetch.mockResolvedValueOnce(ok("--- Page 1 ---\nIN THE COURT ..."));
    await transcribeDocument(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf", { requestId: "r", deadlineAt: Date.now() + 60_000 });
    const body = JSON.parse(String((h.fetch.mock.calls[0][1] as RequestInit).body));
    expect(body.messages[1].content[0]).toMatchObject({ type: "file", file: { filename: "order.pdf", file_data: expect.stringMatching(/^data:application\/pdf;base64,/) } });
    expect(body.plugins).toEqual([{ id: "file-parser", pdf: { engine: "native" } }]);
    expect(body.response_format).toBeUndefined();
  });

  it.each([
    [401, "invalid_key", 1], [402, "quota", 1], [429, "quota", 1], [403, "blocked", 1], [404, "model_not_found", 1],
    [400, "bad_request", 1], [503, "unavailable", 1], [502, "unavailable", 2], [408, "timeout", 2],
  ])("HTTP %i -> %s after %i attempt(s)", async (status, kind, calls) => {
    for (let i = 0; i < calls; i++) h.fetch.mockResolvedValueOnce(reply({ error: { code: status, message: "provider detail that must not leak" } }, status));
    const e = await run().catch((x) => x);
    expect(e).toBeInstanceOf(AIError);
    expect(e.kind).toBe(kind);
    expect(e.message).not.toContain("provider detail");
    expect(h.fetch).toHaveBeenCalledTimes(calls);
  });

  it("an error inside a 200 response is still an error", async () => {
    h.fetch.mockResolvedValueOnce(reply({ error: { code: 429, message: "Rate limit exceeded" } }, 200));
    expect(await kindOf(run())).toBe("quota");
  });

  it("a mid-generation provider error is retried once, then succeeds", async () => {
    h.fetch.mockResolvedValueOnce(reply({ choices: [{ finish_reason: "error", message: { content: "" } }] })).mockResolvedValueOnce(ok(OUT));
    const ex = await run();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(ex.ai?.usage.attempts).toBe(2);
  });

  it("cut-off, filtered, non-JSON and wrong-shape answers are discarded", async () => {
    h.fetch.mockResolvedValueOnce(ok(OUT, "length"));
    expect(await kindOf(run())).toBe("invalid_output");
    h.fetch.mockResolvedValueOnce(ok(OUT, "content_filter"));
    expect(await kindOf(run())).toBe("blocked");
    h.fetch.mockResolvedValueOnce(ok("{not json"));
    expect(await kindOf(run())).toBe("invalid_output");
    h.fetch.mockResolvedValueOnce(ok({ ...OUT, parties: "Lakshmi" }));
    expect(await kindOf(run())).toBe("invalid_output");
    h.fetch.mockResolvedValueOnce(new Response("<html>gateway error</html>", { status: 502 })).mockResolvedValueOnce(new Response("<html>gateway error</html>", { status: 502 }));
    expect(await kindOf(run())).toBe("unavailable");
  });

  it("a hung request is aborted at the timeout and retried once", async () => {
    const hang = (_u: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }))));
    h.fetch.mockImplementationOnce(hang).mockImplementationOnce(hang);
    expect(await kindOf(generate({ task: "t", requestId: "r", system: "s", parts: [{ text: "x" }], timeoutMs: 50 }))).toBe("timeout");
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("a network failure is retried once", async () => {
    h.fetch.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(ok(OUT));
    await run();
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("provider error text in the log", () => {
  it("is short and scrubbed of keys and emails", async () => {
    const { providerDetail } = await import("@/lib/ai/client");
    const d = providerDetail(new Error("Invalid schema for key sk-or-v1-abcdef0123456789 sent by someone@example.com: " + "x".repeat(400)))!;
    expect(d).not.toMatch(/sk-or-v1-abc|someone@example\.com/);
    expect(d.length).toBeLessThanOrEqual(300);
  });
});
