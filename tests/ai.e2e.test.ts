// AI endpoints over real HTTP, against a running AdvoFlow in PASSWORD mode WITHOUT an AI key (as in CI):
// authentication, office isolation, explicit confirmation, no writes before confirmation, a clear configuration
// error, and nothing else affected. THROWAWAY database only:
//   E2E_BASE_URL=... E2E_DATABASE_URL=... E2E_SERVER_LOG=server.log npx vitest run tests/ai.e2e.test.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createAccount } from "@/lib/auth/accounts";

const BASE = process.env.E2E_BASE_URL;
const DB = process.env.E2E_DATABASE_URL;
const LOG = process.env.E2E_SERVER_LOG;
const run = Math.random().toString(36).slice(2, 8);
type Jar = { cookie: string };
type Res = { status: number; body: any; text: string; headers: Headers };

async function http(method: string, path: string, opts: { jar?: Jar; json?: unknown; form?: FormData } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.jar?.cookie) headers.cookie = opts.jar.cookie;
  if (opts.json !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers, body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined), redirect: "manual" });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  if (opts.jar) {
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [name, value] = pair.split("=");
      if (name.includes("session_token") || name.includes("two_factor")) {
        const others = opts.jar.cookie.split("; ").filter((x) => x && !x.startsWith(`${name}=`));
        opts.jar.cookie = [...others, ...(value ? [`${name}=${value}`] : [])].join("; ");
      }
    }
  }
  return { status: r.status, body, text, headers: r.headers };
}
const hash = (scope: string, v: string) => createHash("sha256").update(`${scope}|${v}`).digest("hex").slice(0, 32);
const logLines = (msg: string, to: string) => readFileSync(LOG!, "utf8").split("\n").filter((l) => l.includes(`"${msg}`) && l.includes(to));
async function signIn(jar: Jar, email: string, password: string) {
  const n = logLines("auth.login_code", hash("otp", email)).length;
  const step1 = await http("POST", "/api/auth/login", { jar, json: { email, password } });
  if (step1.body?.status === "signed_in") return step1;
  for (let i = 0; i < 40 && logLines("auth.login_code", hash("otp", email)).length <= n; i++) await new Promise((r) => setTimeout(r, 100));
  const lines = logLines("auth.login_code", hash("otp", email));
  return http("POST", "/api/auth/verify", { jar, json: { code: JSON.parse(lines[lines.length - 1]).code } });
}
const expectError = (r: Res, status: number, code: string) => {
  expect(r.status, r.text.slice(0, 200)).toBe(status);
  expect(r.body).toMatchObject({ code, error: expect.any(String), requestId: expect.any(String) });
};

// A FICTIONAL order (rule-based extraction runs because no AI key is configured on the test server).
const ORDER = (n: string) => `IN THE COURT OF THE CITY CIVIL JUDGE, BENGALURU
O.S. No. ${n}/2026
Asha Kumar v. Ravi Prakash
Date: 14-10-2026
Defendant sought time to file written statement. Time granted subject to costs of Rs. 500.
Adjourned to 25-11-2026 for written statement.`;

describe.skipIf(!BASE || !DB || !LOG)("AI endpoints over HTTP (no AI key configured)", () => {
  let db: PrismaClient;
  const A: Jar = { cookie: "" };
  const B: Jar = { cookie: "" };
  const pw = `Ai-test-${run}-long password!`;
  let jobId = "";
  let judgmentsBefore: number | null = null;
  const judgments = async () => {
    const [{ t }] = await db.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public.legal_judgments')::text AS t`;
    if (!t) return null;
    const [{ n }] = await db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM public.legal_judgments`;
    return Number(n);
  };

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB! }) });
    await db.rateLimit.deleteMany({});
    judgmentsBefore = await judgments();
    await createAccount(db, { email: `ai.a.${run}@example.test`, name: "AI A", password: pw, role: "owner", officeName: `AI A ${run}` });
    await createAccount(db, { email: `ai.b.${run}@example.test`, name: "AI B", password: pw, role: "owner", officeName: `AI B ${run}` });
    expect((await signIn(A, `ai.a.${run}@example.test`, pw)).status).toBe(200);
    expect((await signIn(B, `ai.b.${run}@example.test`, pw)).status).toBe(200);
  }, 120_000);
  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { contains: `.${run}@` } }, select: { id: true, memberships: { select: { officeId: true } } } });
    await db.office.deleteMany({ where: { id: { in: users.flatMap((u) => u.memberships.map((m) => m.officeId)) } } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  });

  it("5. unauthenticated requests are rejected", async () => {
    expectError(await http("POST", "/api/ai/extract-court-order", { json: { text: ORDER("1") } }), 401, "UNAUTHENTICATED");
    expectError(await http("GET", "/api/ai/extractions/anything"), 401, "UNAUTHENTICATED");
    expectError(await http("POST", "/api/ai/extractions/anything/confirm", { json: { confirm: true } }), 401, "UNAUTHENTICATED");
    expectError(await http("POST", "/api/ai/extractions/anything/reject", { json: {} }), 401, "UNAUTHENTICATED");
  });

  it("10. without an AI key: a clear configuration error, and the rest of the app works", async () => {
    const r = await http("POST", "/api/ai/extract-court-order", { jar: A, json: { text: ORDER("2") } });
    expectError(r, 503, "AI_NOT_CONFIGURED");
    expect(r.headers.get("x-request-id")).toBe(r.body.requestId);
    expect(r.text).not.toMatch(/sk-|AIza|api[_-]?key=/i);
    expect((await http("GET", "/api/health")).status).toBe(200);
    expect((await http("GET", "/api/auth/me", { jar: A })).status).toBe(200);
    expect((await http("GET", "/api/calendar", { jar: A })).status).toBe(200);
    // Uploads still work with the rule-based extractor.
    const f = new FormData();
    f.set("text", ORDER("3"));
    const up = await http("POST", "/api/orders/process", { jar: A, form: f });
    expect(up.status, up.text.slice(0, 200)).toBe(200);
    expect(up.body.results[0]).toMatchObject({ status: "needs_review" });
    jobId = up.body.results[0].jobId;
  });

  it("the draft is readable through the AI API, unverified, and nothing was written to a case", async () => {
    const r = await http("GET", `/api/ai/extractions/${jobId}`, { jar: A });
    expect(r.status).toBe(200);
    expect(r.body.extraction).toMatchObject({ id: jobId, status: "pending_review", verified: false, resultOrderId: null });
    expect(r.text).not.toMatch(/storageKey|textExtract/);
    const officeId = (await db.membership.findFirstOrThrow({ where: { user: { email: `ai.a.${run}@example.test` } } })).officeId;
    expect(await db.case.count({ where: { officeId } })).toBe(0);
    expect(await db.courtOrder.count({ where: { officeId } })).toBe(0);
    expect(await db.hearing.count({ where: { officeId } })).toBe(0);
    expect(await db.task.count({ where: { officeId } })).toBe(0);
  });

  it("6. another advocate cannot read, confirm or reject it (same 404 as an unknown id)", async () => {
    expectError(await http("GET", `/api/ai/extractions/${jobId}`, { jar: B }), 404, "NOT_FOUND");
    expectError(await http("GET", `/api/ai/extractions/job_unknown_${run}`, { jar: B }), 404, "NOT_FOUND");
    const ex = (await http("GET", `/api/ai/extractions/${jobId}`, { jar: A })).body.extraction.extraction;
    expectError(await http("POST", `/api/ai/extractions/${jobId}/confirm`, { jar: B, json: { confirm: true, input: decisions(ex, `O.S. No. 3/2026`) } }), 404, "NOT_FOUND");
    expectError(await http("POST", `/api/ai/extractions/${jobId}/reject`, { jar: B, json: {} }), 404, "NOT_FOUND");
    expect((await http("GET", `/api/ai/extractions/${jobId}`, { jar: A })).body.extraction.status).toBe("pending_review");
  });

  it("8. confirmation must be explicit and well-formed", async () => {
    const ex = (await http("GET", `/api/ai/extractions/${jobId}`, { jar: A })).body.extraction.extraction;
    expectError(await http("POST", `/api/ai/extractions/${jobId}/confirm`, { jar: A, json: { input: decisions(ex, "O.S. No. 3/2026") } }), 400, "VALIDATION_ERROR");
    expectError(await http("POST", `/api/ai/extractions/${jobId}/confirm`, { jar: A, json: { confirm: "yes", input: decisions(ex, "O.S. No. 3/2026") } }), 400, "VALIDATION_ERROR");
    expectError(await http("POST", `/api/ai/extractions/${jobId}/confirm`, { jar: A, json: { confirm: true, input: decisions(ex, "O.S. No. 3/2026"), approvedBy: "someone-else" } }), 400, "VALIDATION_ERROR");
    expect((await http("GET", `/api/ai/extractions/${jobId}`, { jar: A })).body.extraction.status).toBe("pending_review");
  });

  it("7. confirming writes only the approved fields and records the review", async () => {
    const ex = (await http("GET", `/api/ai/extractions/${jobId}`, { jar: A })).body.extraction.extraction;
    const input = decisions(ex, "O.S. No. 3/2026");
    input.fields.costs = { approved: false, value: ex.costs.value }; // rejected
    const r = await http("POST", `/api/ai/extractions/${jobId}/confirm`, { jar: A, json: { confirm: true, input } });
    expect(r.status, r.text.slice(0, 300)).toBe(200);
    expect(r.body.extraction).toMatchObject({ status: "approved", verified: true });
    const order = await db.courtOrder.findUniqueOrThrow({ where: { id: r.body.orderId } });
    expect(order.costs).toBeNull();
    expect(order.nextHearingDate?.toISOString().slice(0, 10)).toBe("2026-11-25");
    expect(order.fieldReview).toMatchObject({ fields: { costs: "rejected", nextHearingDate: "accepted" } });
    expect(order.approvedById).toBeTruthy();
    const again = await http("POST", `/api/ai/extractions/${jobId}/confirm`, { jar: A, json: { confirm: true, input } });
    expect(again.body).toMatchObject({ orderId: r.body.orderId, alreadyApproved: true });
    expect(await db.courtOrder.count({ where: { jobId } })).toBe(1);
  });

  it("11. the judgments dataset is untouched", async () => {
    expect(await judgments()).toBe(judgmentsBefore);
  });
});

function decisions(ex: any, number: string) {
  const f = (v: { value: unknown }) => ({ approved: v.value !== null, value: v.value });
  return {
    caseDecision: { mode: "new", number, title: ex.title.value ?? "", court: ex.court.value ?? "", caseType: "" },
    fields: { orderDate: f(ex.orderDate), nextHearingDate: f(ex.nextHearingDate), stage: f(ex.stage), summary: f(ex.summary), adjourned: f(ex.adjourned), costs: f(ex.costs), court: f(ex.court), title: f(ex.title) },
    confirmHearing: true,
    directions: ex.directions,
    tasks: ex.tasks.map((t: any) => ({ key: t.key, approved: true, title: t.title, dueDate: t.dueDate, priority: t.priority })),
  };
}
