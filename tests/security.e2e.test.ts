// End-to-end security tests over real HTTP against a running AdvoFlow in PASSWORD mode.
// Runs only when E2E_BASE_URL and E2E_DATABASE_URL are set, and must point at a THROWAWAY database, e.g.
//   AUTH_MODE=password AUTH_SECRET=<32+ chars> ALLOW_REGISTRATION=true DATABASE_URL=<test db> npx next start -p 3100
//   E2E_BASE_URL=http://localhost:3100 E2E_DATABASE_URL=<test db> npx vitest run tests/security.e2e.test.ts
// Two independent advocates (A and B) register; B then tries every way of reaching A's records.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createAccount } from "@/lib/auth/accounts";

const BASE = process.env.E2E_BASE_URL;
const DB = process.env.E2E_DATABASE_URL;
const run = Math.random().toString(36).slice(2, 8);
const PASSWORDS = [`A-pass-${run}-correct horse`, `B-pass-${run}-battery staple`, `V-pass-${run}-viewer only!!`];
const seen: string[] = []; // every response body, checked for leaked secrets at the end

type Jar = { cookie: string };
type Res = { status: number; body: any; text: string; headers: Headers };

async function http(method: string, path: string, opts: { jar?: Jar; json?: unknown; form?: FormData; headers?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.jar?.cookie) headers.cookie = opts.jar.cookie;
  if (opts.json !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers, body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined), redirect: "manual" });
  const text = await r.text();
  seen.push(text);
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* HTML page */ }
  if (opts.jar) {
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [name, value] = pair.split("=");
      if (name.includes("session_token")) opts.jar.cookie = value ? `${name}=${value}` : "";
    }
  }
  return { status: r.status, body, text, headers: r.headers };
}

const expectError = (r: Res, status: number, code: string) => {
  expect(r.status).toBe(status);
  expect(r.body).toMatchObject({ code, error: expect.any(String), requestId: expect.any(String) });
  expect(r.text).not.toMatch(/at \S+\.(ts|js):\d+|prisma|postgres|SELECT /i); // no stack traces or SQL
};

describe.skipIf(!BASE || !DB)("security over HTTP (password mode)", () => {
  const A: Jar = { cookie: "" };
  const B: Jar = { cookie: "" };
  const V: Jar = { cookie: "" };
  const emailA = `advocate.a.${run}@example.test`;
  const emailB = `advocate.b.${run}@example.test`;
  const emailV = `viewer.${run}@example.test`;
  let db: PrismaClient;
  const ids = { officeA: "", officeB: "", caseA: "", taskA: "", hearingA: "", jobA: "", docA: "", msgA: "", reportA: "", caseB: "" };

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB! }) });
    await db.rateLimit.deleteMany({}); // throwaway database: start every run with fresh rate-limit counters
    const ra = await http("POST", "/api/auth/register", { jar: A, json: { name: "Advocate A", email: emailA, password: PASSWORDS[0], officeName: "A Chambers" } });
    const rb = await http("POST", "/api/auth/register", { jar: B, json: { name: "Advocate B", email: emailB, password: PASSWORDS[1], officeName: "B Chambers" } });
    expect(ra.status).toBe(201);
    expect(rb.status).toBe(201);
    ids.officeA = ra.body.office.id;
    ids.officeB = rb.body.office.id;

    // A's records: a case, a task, an uploaded + approved order (document, review item, order, hearing, client messages).
    ids.caseA = (await http("POST", "/api/cases", { jar: A, json: { number: "O.S. 321/2026", petitioner: "Private Client A", respondent: "Opponent", court: "Mysuru" } })).body.case.id;
    ids.taskA = (await http("POST", "/api/tasks", { jar: A, json: { caseId: ids.caseA, title: "Private task of A", dueDate: "2026-11-30", priority: "high" } })).body.task.id;
    const f = new FormData();
    f.set("text", `IN THE COURT OF THE PRINCIPAL CIVIL JUDGE, MYSURU\nO.S. No. 321/2026\nPrivate Client A v. Opponent\nDate: 20-10-2026\nPlaintiff present. Adjourned to 25-11-2026 for evidence. (${run})`);
    ids.jobA = (await http("POST", "/api/orders/process", { jar: A, form: f })).body.results[0].jobId;
    let wa = (await http("GET", "/api/export", { jar: A })).body;
    const ex = wa.jobs.find((j: any) => j.id === ids.jobA).extraction;
    const fld = (v: any) => ({ approved: v.value !== null, value: v.value });
    const ap = await http("POST", `/api/jobs/${ids.jobA}`, { jar: A, json: { action: "approve", input: {
      caseDecision: { mode: "existing", caseId: ids.caseA },
      fields: { orderDate: fld(ex.orderDate), nextHearingDate: fld(ex.nextHearingDate), stage: fld(ex.stage), summary: fld(ex.summary), adjourned: fld(ex.adjourned), costs: fld(ex.costs), court: fld(ex.court), title: fld(ex.title) },
      confirmHearing: false, directions: [], tasks: [] } } });
    expect(ap.status).toBe(200);
    wa = (await http("GET", "/api/export", { jar: A })).body;
    ids.hearingA = wa.hearings.find((h: any) => h.caseId === ids.caseA).id;
    ids.docA = wa.documents.find((d: any) => d.caseId === ids.caseA).id;
    ids.msgA = wa.clientUpdates.find((u: any) => u.caseId === ids.caseA).id;
    ids.reportA = (await http("POST", "/api/research", { jar: A, json: { caseId: ids.caseA, question: "Private research question", orderIds: [] } })).body?.reportId ?? "";
    wa = (await http("GET", "/api/export", { jar: A })).body;
    ids.reportA = wa.research.find((r: any) => r.caseId === ids.caseA)?.id ?? ids.reportA;
    ids.caseB = (await http("POST", "/api/cases", { jar: B, json: { number: "W.P. 9/2026" } })).body.case.id;

    // A viewer in A's office (provisioned the way an administrator would).
    await createAccount(db, { email: emailV, name: "Viewer", password: PASSWORDS[2], role: "viewer", officeId: ids.officeA });
    expect((await http("POST", "/api/auth/login", { jar: V, json: { email: emailV, password: PASSWORDS[2] } })).status).toBe(200);
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    await db.office.deleteMany({ where: { id: { in: [ids.officeA, ids.officeB].filter(Boolean) } } });
    await db.user.deleteMany({ where: { email: { in: [emailA, emailB, emailV] } } });
    await db.$disconnect();
  });

  it("1. without a session every private endpoint answers 401, and pages redirect to /login", async () => {
    const calls: [string, string, unknown?][] = [
      ["GET", "/api/auth/me"], ["GET", "/api/export"], ["GET", "/api/calendar"], ["GET", `/api/documents/${ids.docA}`], ["GET", "/api/judgments?q=written+statement"],
      ["POST", "/api/cases", { number: "X 1/2026" }], ["PATCH", `/api/cases/${ids.caseA}`, { number: "X" }], ["POST", `/api/cases/${ids.caseA}/status`, { status: "archived" }],
      ["POST", "/api/tasks", { caseId: ids.caseA, title: "x" }], ["PATCH", `/api/tasks/${ids.taskA}`, { status: "done" }], ["POST", `/api/hearings/${ids.hearingA}`, { action: "confirm" }],
      ["POST", `/api/jobs/${ids.jobA}`, { action: "reject" }], ["PATCH", `/api/client-updates/${ids.msgA}`, { text: "x" }], ["POST", "/api/research", { caseId: ids.caseA, orderIds: [] }],
      ["POST", "/api/clients", { name: "x" }], ["POST", "/api/demo", { action: "load" }], ["POST", "/api/import/case-diary", { data: "{}" }],
    ];
    for (const [m, p, j] of calls) expectError(await http(m, p, { json: j }), 401, "UNAUTHENTICATED");
    // A forged or expired cookie is no better than none.
    const fake: Jar = { cookie: "__Secure-advoflow.session_token=forged.value" };
    expectError(await http("GET", "/api/export", { jar: fake }), 401, "UNAUTHENTICATED");
    const page = await http("GET", `/cases/${ids.caseA}`);
    expect([302, 307]).toContain(page.status);
    expect(page.headers.get("location")).toContain("/login");
  });

  it("2. an advocate can use their own records", async () => {
    const me = await http("GET", "/api/auth/me", { jar: A });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ user: { email: emailA, name: "Advocate A" }, office: { id: ids.officeA, role: "owner" }, mode: "password" });
    expect((await http("GET", `/api/documents/${ids.docA}`, { jar: A })).status).toBe(200);
    expect((await http("GET", `/cases/${ids.caseA}`, { jar: A })).status).toBe(200);
    expect((await http("PATCH", `/api/tasks/${ids.taskA}`, { jar: A, json: { priority: "normal" } })).status).toBe(200);
  });

  it("3. advocate B cannot read advocate A's case (page, export or any listing)", async () => {
    const page = await http("GET", `/cases/${ids.caseA}`, { jar: B });
    expect(page.status).toBe(404);
    expect(page.text).not.toContain("Private Client A");
    const exp = (await http("GET", "/api/export", { jar: B })).text;
    for (const id of Object.values(ids).filter((x) => x && x !== ids.officeB && x !== ids.caseB)) expect(exp).not.toContain(id);
    for (const p of ["/", "/cases", "/tasks", "/calendar", "/research", "/clients", "/reports"]) {
      const r = await http("GET", p, { jar: B });
      expect(r.status).toBe(200);
      expect(r.text).not.toContain("Private Client A");
      expect(r.text).not.toContain("Private task of A");
    }
  });

  it("4. advocate B cannot edit, close or archive advocate A's case, and A's case is unchanged", async () => {
    expectError(await http("PATCH", `/api/cases/${ids.caseA}`, { jar: B, json: { number: "O.S. 999/2026", petitioner: "Hijacked" } }), 404, "NOT_FOUND");
    expectError(await http("POST", `/api/cases/${ids.caseA}/status`, { jar: B, json: { status: "archived" } }), 404, "NOT_FOUND");
    expectError(await http("POST", `/api/cases/${ids.caseA}/client`, { jar: B, json: { clientId: null } }), 404, "NOT_FOUND");
    const c = (await http("GET", "/api/export", { jar: A })).body.cases.find((x: any) => x.id === ids.caseA);
    expect(c).toMatchObject({ number: "O.S. 321/2026", status: "active", parties: { petitioner: "Private Client A" } });
  });

  it("5. changing record ids does not reach another advocate's hearings, orders, tasks, documents, messages or research", async () => {
    expectError(await http("POST", `/api/hearings/${ids.hearingA}`, { jar: B, json: { action: "confirm" } }), 404, "NOT_FOUND");
    expectError(await http("POST", `/api/hearings/${ids.hearingA}`, { jar: B, json: { action: "cancel" } }), 404, "NOT_FOUND");
    expectError(await http("POST", `/api/jobs/${ids.jobA}`, { jar: B, json: { action: "reject" } }), 404, "NOT_FOUND");
    expectError(await http("POST", `/api/jobs/${ids.jobA}`, { jar: B, json: { action: "reopen" } }), 404, "NOT_FOUND");
    expectError(await http("PATCH", `/api/tasks/${ids.taskA}`, { jar: B, json: { status: "done" } }), 404, "NOT_FOUND");
    expectError(await http("POST", `/api/tasks/${ids.taskA}/reschedule`, { jar: B, json: { action: "move" } }), 404, "NOT_FOUND");
    expectError(await http("GET", `/api/documents/${ids.docA}`, { jar: B }), 404, "NOT_FOUND");
    expectError(await http("PATCH", `/api/client-updates/${ids.msgA}`, { jar: B, json: { text: "changed by B" } }), 404, "NOT_FOUND");
    if (ids.reportA) expectError(await http("POST", `/api/research/${ids.reportA}/1`, { jar: B, json: { type: "mark_reviewed" } }), 404, "NOT_FOUND");
    // The same 404 as for an id that does not exist at all: existence is not revealed.
    const ghost = await http("GET", "/api/documents/doc_does_not_exist", { jar: B });
    expect(ghost.body.error).toBe((await http("GET", `/api/documents/${ids.docA}`, { jar: B })).body.error);
    // And nothing of A's changed.
    const wa = (await http("GET", "/api/export", { jar: A })).body;
    expect(wa.hearings.find((h: any) => h.id === ids.hearingA).status).toBe("awaiting_verification");
    expect(wa.tasks.find((t: any) => t.id === ids.taskA).status).toBe("open");
    expect(wa.clientUpdates.find((u: any) => u.id === ids.msgA).text).not.toBe("changed by B");
  });

  it("6. forged office or user ids in request bodies grant nothing", async () => {
    expectError(await http("POST", "/api/tasks", { jar: B, json: { caseId: ids.caseA, title: "Planted task", dueDate: null, officeId: ids.officeA } }), 404, "NOT_FOUND");
    expectError(await http("POST", "/api/research", { jar: B, json: { caseId: ids.caseA, orderIds: [], officeId: ids.officeA } }), 404, "NOT_FOUND");
    const planted = await http("POST", "/api/cases", { jar: B, json: { number: "O.S. 555/2026", officeId: ids.officeA, userId: "someone-else", isDemo: true } });
    expect(planted.status).toBe(200);
    const wa = (await http("GET", "/api/export", { jar: A })).body;
    const wb = (await http("GET", "/api/export", { jar: B })).body;
    expect(wa.cases.some((c: any) => c.number === "O.S. 555/2026")).toBe(false);
    expect(wb.cases.find((c: any) => c.number === "O.S. 555/2026")).toMatchObject({ isDemo: false });
    expect(wa.tasks.some((t: any) => t.title === "Planted task")).toBe(false);
    // Approving one of B's own uploads INTO A's case is refused.
    const f = new FormData();
    f.set("text", `IN THE COURT OF THE CIVIL JUDGE\nO.S. No. 321/2026\nDate: 21-10-2026\nAdjourned. (${run}-b)`);
    const jobB = (await http("POST", "/api/orders/process", { jar: B, form: f })).body.results[0].jobId;
    const r = await http("POST", `/api/jobs/${jobB}`, { jar: B, json: { action: "approve", input: { caseDecision: { mode: "existing", caseId: ids.caseA },
      fields: Object.fromEntries(["orderDate", "nextHearingDate", "stage", "summary", "adjourned", "costs", "court", "title"].map((k) => [k, { approved: false, value: null }])), confirmHearing: false, directions: [], tasks: [] } } });
    expectError(r, 404, "NOT_FOUND");
    // A viewer of A's office can read but not change anything.
    expect((await http("GET", "/api/export", { jar: V })).status).toBe(403);
    expect((await http("GET", `/cases/${ids.caseA}`, { jar: V })).status).toBe(200);
    expectError(await http("PATCH", `/api/tasks/${ids.taskA}`, { jar: V, json: { status: "done" } }), 403, "FORBIDDEN");
    expectError(await http("POST", `/api/hearings/${ids.hearingA}`, { jar: V, json: { action: "confirm" } }), 403, "FORBIDDEN");
  });

  it("7. invalid credentials fail safely: same answer for a wrong password and an unknown email, no cookie, then rate limited", async () => {
    const wrong = await http("POST", "/api/auth/login", { json: { email: emailA, password: "not the password at all" } });
    const unknown = await http("POST", "/api/auth/login", { json: { email: `nobody.${run}@example.test`, password: "not the password at all" } });
    expectError(wrong, 401, "UNAUTHENTICATED");
    expectError(unknown, 401, "UNAUTHENTICATED");
    expect(wrong.body.error).toBe(unknown.body.error);
    expect(wrong.headers.getSetCookie().filter((c) => c.includes("session_token=") && !c.includes("Max-Age=0"))).toEqual([]);
    expectError(await http("POST", "/api/auth/login", { json: { email: "not-an-email", password: "x" } }), 400, "VALIDATION_ERROR");
    expectError(await http("POST", "/api/auth/register", { json: { name: "Dup", email: emailA.toUpperCase(), password: "another long password" } }), 400, "VALIDATION_ERROR");
    expectError(await http("POST", "/api/auth/register", { json: { name: "Weak", email: `weak.${run}@example.test`, password: "short" } }), 400, "VALIDATION_ERROR");
    const target = `bruteforce.${run}@example.test`;
    let last: Res | null = null;
    for (let i = 0; i < 9; i++) last = await http("POST", "/api/auth/login", { json: { email: target, password: `guess number ${i}` } });
    expectError(last!, 429, "RATE_LIMITED");
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("session cookies are HttpOnly and SameSite=Lax, and cross-site writes are refused (CSRF)", async () => {
    const j: Jar = { cookie: "" };
    const r = await http("POST", "/api/auth/login", { jar: j, json: { email: emailB, password: PASSWORDS[1] } });
    const c = r.headers.getSetCookie().find((x) => x.includes("session_token="))!;
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Max-Age=43200/); // 12 hours
    expectError(await http("POST", "/api/cases", { jar: j, json: { number: "O.S. 1/2027" }, headers: { origin: "https://evil.example" } }), 403, "FORBIDDEN");
    expectError(await http("PATCH", `/api/cases/${ids.caseB}`, { jar: j, json: { number: "X" }, headers: { "sec-fetch-site": "cross-site" } }), 403, "FORBIDDEN");
  });

  it("8. no endpoint ever returns a password, a hash or a session token", async () => {
    const all = seen.join("\n");
    for (const p of PASSWORDS) expect(all).not.toContain(p);
    expect(all).not.toMatch(/\$argon2id\$|passwordHash|"password"\s*:|session_token|"token"\s*:/);
  });

  it("9. logout ends the session on the server: the old cookie stops working", async () => {
    const before = A.cookie;
    expect((await http("GET", "/api/auth/me", { jar: A })).status).toBe(200);
    const out = await http("POST", "/api/auth/logout", { jar: A });
    expect(out.status).toBe(200);
    expect(A.cookie).toBe(""); // the browser is told to forget it
    expectError(await http("GET", "/api/auth/me", { jar: { cookie: before } }), 401, "UNAUTHENTICATED"); // a copied cookie is dead too
    expectError(await http("GET", "/api/export", { jar: { cookie: before } }), 401, "UNAUTHENTICATED");
    expect((await http("POST", "/api/auth/logout")).status).toBe(200); // harmless without a session
  });

  it("deactivating a user ends their access immediately, even with a valid cookie", async () => {
    expect((await http("GET", "/api/auth/me", { jar: V })).status).toBe(200);
    await db.user.update({ where: { email: emailV }, data: { isActive: false } });
    expectError(await http("GET", "/api/auth/me", { jar: V }), 401, "UNAUTHENTICATED");
    expectError(await http("POST", "/api/auth/login", { json: { email: emailV, password: PASSWORDS[2] } }), 401, "UNAUTHENTICATED");
  });

  it("10. the shared judgments corpus stays readable through its own read-only endpoint, separate from office data", async () => {
    const pg = new Client({ connectionString: DB });
    await pg.connect();
    const id = `sc:e2e_${run}`;
    await pg.query(
      "INSERT INTO public.legal_judgments (id, source, court, title, citation, decision_date, text, text_kind, dataset) VALUES ($1,'sc','Supreme Court of India',$2,'[2099] 1 S.C.R. 1','2020-01-01',$3,'headnotes','e2e-test')",
      [id, `E2E ${run} v. Test`, `Issue for Consideration zq${run}alpha zq${run}beta delay in written statement. Headnotes Code of Civil Procedure.`],
    );
    const before = Number((await pg.query("SELECT count(*) FROM public.legal_judgments")).rows[0].count);
    const r = await http("GET", `/api/judgments?q=zq${run}alpha+zq${run}beta`, { jar: B });
    expect(r.status).toBe(200);
    expect(r.body.results.map((x: any) => x.sourceId)).toContain(id);
    expect(r.body.attribution).toMatch(/CC-BY-4.0/);
    expectError(await http("GET", `/api/judgments?q=zq${run}alpha`), 401, "UNAUTHENTICATED");
    expect(Number((await pg.query("SELECT count(*) FROM public.legal_judgments")).rows[0].count)).toBe(before); // read-only
    await pg.query("DELETE FROM public.legal_judgments WHERE dataset = 'e2e-test'");
    await pg.end();
  });
});
