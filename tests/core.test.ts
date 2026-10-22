import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApproveInput } from "@/lib/schemas";
import type { Session, Workspace } from "@/lib/types";
import { emptyWorkspace, mutate, PermissionError } from "@/lib/services/workspace";
import { demoExtract } from "@/lib/extraction/demo-extractor";
import { approveJob, createJob, currentHearing, matchCase, rejectJob, resolveReschedule, confirmHearing } from "@/lib/services/orders";
import { createCase, createTask, updateTask } from "@/lib/services/cases";
import { calendarCsv, dashboard } from "@/lib/services/queries";
import { researchAction, saveResearchVersion } from "@/lib/services/research";
import { seedDemo, clearDemo } from "@/lib/demo/seed";
import { FileStore } from "@/lib/store/file-store";
import { caseNumberKey, parseIndianDate, sha256, todayIST, addDays } from "@/lib/util";
import { hashPassword, verifyPassword, normalizeEmail } from "@/lib/auth/password";
import { whatsappLink } from "@/lib/messages";

const S: Session = { userId: "u1", officeId: "office_a", role: "owner", name: "Test", mode: "demo" };
const ddmm = (d: string) => d.split("-").reverse().join("-");
const today = todayIST();

function ws(): Workspace {
  return emptyWorkspace("office_a", "Test Office", []);
}
function doc(text: string) {
  const sha = sha256(text);
  return { id: "doc_" + sha.slice(0, 10), caseId: null, filename: "o.txt", mime: "text/plain", size: text.length, sha256: sha, storageKey: "k", kind: "order" as const, textExtract: text, textSource: "pasted" as const, isDemo: false, uploadedBy: "u1", createdAt: new Date().toISOString() };
}
function allApproved(ex: ReturnType<typeof demoExtract>, decision: ApproveInput["caseDecision"], confirm = true): ApproveInput {
  const f = <T,>(v: { value: T | null }) => ({ approved: v.value !== null, value: v.value });
  return {
    caseDecision: decision,
    fields: { orderDate: f(ex.orderDate), nextHearingDate: f(ex.nextHearingDate), stage: f(ex.stage), summary: f(ex.summary), adjourned: f(ex.adjourned), costs: f(ex.costs), court: f(ex.court), title: f(ex.title) },
    confirmHearing: confirm,
    directions: ex.directions,
    tasks: ex.tasks.map((t) => ({ key: t.key, approved: true, title: t.title, dueDate: t.dueDate, priority: t.priority })),
  };
}
const order = (date: string, next: string | null, extra = "") =>
  `IN THE COURT OF THE CITY CIVIL JUDGE, BENGALURU\nO.S. No. 482/2025\nRamesh v. Suresh\nDate: ${ddmm(date)}\nDefendant sought time. Defendant to file written statement on or before the next date. ${extra}${next ? `Adjourned to ${ddmm(next)} for written statement.` : "List after two weeks."}`;

describe("dates and case numbers", () => {
  it("parses Indian day-first dates and rejects impossible ones", () => {
    expect(parseIndianDate("05-11-2026")).toBe("2026-11-05");
    expect(parseIndianDate("5/11/2026")).toBe("2026-11-05");
    expect(parseIndianDate("5th November 2026")).toBe("2026-11-05");
    expect(parseIndianDate("31-02-2026")).toBeNull();
  });
  it("normalises different spellings of a case number", () => {
    expect(caseNumberKey("O.S.No.482 of 2025")).toBe("OS|482|2025");
    expect(caseNumberKey("OS 482/2025")).toBe("OS|482|2025");
    expect(caseNumberKey("O.S. 482/2024")).toBe("OS|482|2024");
    expect(caseNumberKey("W.P. No. 12345/2024")).toBe("WP|12345|2024");
  });
});

describe("demo extraction", () => {
  it("extracts stated fields with their source passages", () => {
    const ex = demoExtract(order("2026-10-22", "2026-11-05", "Time granted as a last chance, subject to costs of Rs. 500. "));
    expect(ex.caseNumber.value).toBe("O.S. 482/2025");
    expect(ex.orderDate).toMatchObject({ value: "2026-10-22", status: "stated" });
    expect(ex.nextHearingDate).toMatchObject({ value: "2026-11-05", status: "stated" });
    expect(ex.nextHearingDate.source).toContain("Adjourned to");
    expect(ex.costs.value).toBe("Rs. 500");
    expect(ex.stage.value).toBe("Written statement");
    expect(ex.tasks.find((t) => t.dueBasis === "next_hearing")?.dueDate).toBe("2026-11-05");
  });
  it("never invents a missing order date or a relative next date", () => {
    const ex = demoExtract("O.S. No. 482/2025\nRamesh v. Suresh\nList after two weeks.");
    expect(ex.orderDate.value).toBeNull();
    expect(ex.nextHearingDate.value).toBeNull();
    expect(ex.warnings.join(" ")).toMatch(/relative date|No order date/);
  });
  it("does not treat a party's request as a direction, and keeps one dated task", () => {
    const ex = demoExtract(order(today, addDays(today, 10), "Defendant's counsel sought further time to file written statement. "));
    expect(ex.directions.some((d) => /sought/.test(d))).toBe(false);
    const ws = ex.tasks.filter((t) => t.key.includes("written statement"));
    expect(ws).toHaveLength(1);
    expect(ws[0].dueDate).toBe(addDays(today, 10));
  });
  it("flags 'list after two weeks' as a relative date", () => {
    expect(demoExtract("W.P. No. 1/2024\nDate: 01-10-2026\nList after two weeks for hearing.").warnings.join(" ")).toMatch(/relative date/);
  });
  it("reads Kannada digits", () => {
    expect(demoExtract("O.S. No. 482/2025\nDate: ೨೨-೧೦-೨೦೨೬\nAdjourned to ೦೫-೧೧-೨೦೨೬").nextHearingDate.value).toBe("2026-11-05");
  });
});

describe("order workflow", () => {
  let w: Workspace;
  beforeEach(() => { w = ws(); });

  it("approving updates case, hearing, tasks and client drafts together", () => {
    const text = order(today, addDays(today, 14));
    const ex = demoExtract(text);
    const { job } = createJob(w, S, { doc: doc(text), idempotencyKey: sha256(text), hint: { caseNumber: "", court: "", context: "" }, extraction: ex, error: null });
    expect(job.match?.kind).toBe("none");
    const r = approveJob(w, S, job.id, allApproved(ex, { mode: "new", number: "O.S. 482/2025", title: "Ramesh v. Suresh", court: "", caseType: "" }));
    expect(w.cases).toHaveLength(1);
    expect(w.orders).toHaveLength(1);
    expect(currentHearing(w, r.caseId)).toMatchObject({ date: addDays(today, 14), status: "confirmed" });
    expect(w.tasks.length).toBeGreaterThan(0);
    expect(w.clientUpdates.map((u) => u.lang).sort()).toEqual(["en", "kn"]);
    expect(w.clientUpdates.find((u) => u.lang === "kn")!.text).toContain("ನಮಸ್ಕಾರ");
  });

  it("is idempotent: re-submitting and re-approving create nothing new", () => {
    const text = order(today, addDays(today, 14));
    const ex = demoExtract(text);
    const d = doc(text);
    const first = createJob(w, S, { doc: d, idempotencyKey: d.sha256, hint: { caseNumber: "", court: "", context: "" }, extraction: ex, error: null });
    const again = createJob(w, S, { doc: d, idempotencyKey: d.sha256, hint: { caseNumber: "", court: "", context: "" }, extraction: ex, error: null });
    expect(again.reused).toBe(true);
    const input = allApproved(ex, { mode: "new", number: "O.S. 482/2025", title: "", court: "", caseType: "" });
    approveJob(w, S, first.job.id, input);
    const counts = [w.orders.length, w.hearings.length, w.tasks.length, w.clientUpdates.length];
    const second = approveJob(w, S, first.job.id, input);
    expect(second.alreadyApproved).toBe(true);
    expect([w.orders.length, w.hearings.length, w.tasks.length, w.clientUpdates.length]).toEqual(counts);
  });

  it("rejecting leaves confirmed records unchanged", () => {
    const text = order(today, addDays(today, 14));
    const ex = demoExtract(text);
    const { job } = createJob(w, S, { doc: doc(text), idempotencyKey: "k1", hint: { caseNumber: "", court: "", context: "" }, extraction: ex, error: null });
    const before = JSON.stringify({ c: w.cases, o: w.orders, h: w.hearings, t: w.tasks });
    rejectJob(w, S, job.id);
    expect(JSON.stringify({ c: w.cases, o: w.orders, h: w.hearings, t: w.tasks })).toBe(before);
    expect(w.documents).toHaveLength(1); // original kept
  });

  it("flags ambiguous matches instead of merging", () => {
    createCase(w, S, { number: "O.S. 482/2024", petitioner: "Ramesh", respondent: "Suresh" });
    createCase(w, S, { number: "M.A. 482/2025", petitioner: "Other", respondent: "Party" });
    const m = matchCase(w, demoExtract(order(today, null)), "");
    expect(m.kind).toBe("ambiguous");
    expect(m.caseId).toBeNull();
    expect(m.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("blocks duplicate cases", () => {
    createCase(w, S, { number: "O.S. 482/2025" });
    expect(() => createCase(w, S, { number: "OS 482 of 2025" })).toThrow(/already exists/);
  });

  it("a date change keeps history, flags open tasks and never touches completed ones", () => {
    const c = createCase(w, S, { number: "O.S. 482/2025" });
    const t1 = order(addDays(today, -5), addDays(today, 5));
    const ex1 = demoExtract(t1);
    const j1 = createJob(w, S, { doc: doc(t1), idempotencyKey: "a", hint: { caseNumber: "", court: "", context: "" }, extraction: ex1, error: null }).job;
    approveJob(w, S, j1.id, allApproved(ex1, { mode: "existing", caseId: c.id }));
    const open = createTask(w, S, { caseId: c.id, title: "Prepare list of dates", dueDate: addDays(today, 5), priority: "normal" });
    const done = createTask(w, S, { caseId: c.id, title: "Already finished", dueDate: addDays(today, 5), priority: "normal" });
    updateTask(w, S, done.id, { status: "done" });
    const t2 = `O.S. No. 482/2025\nDate: ${ddmm(addDays(today, -1))}\nPresiding Officer on leave. Call on ${ddmm(addDays(today, 9))} for written statement.`;
    const ex2 = demoExtract(t2);
    const j2 = createJob(w, S, { doc: doc(t2), idempotencyKey: "b", hint: { caseNumber: "", court: "", context: "" }, extraction: ex2, error: null }).job;
    approveJob(w, S, j2.id, allApproved(ex2, { mode: "existing", caseId: c.id }));
    expect(w.hearings.find((h) => h.date === addDays(today, 5))?.status).toBe("superseded");
    expect(currentHearing(w, c.id)?.date).toBe(addDays(today, 9));
    expect(w.dateChanges).toHaveLength(1);
    expect(w.tasks.find((t) => t.id === open.id)?.needsReschedule).toEqual({ from: addDays(today, 5), to: addDays(today, 9) });
    expect(w.tasks.find((t) => t.id === open.id)?.dueDate).toBe(addDays(today, 5)); // not moved silently
    const fin = w.tasks.find((t) => t.id === done.id)!;
    expect(fin.status).toBe("done");
    expect(fin.needsReschedule).toBeNull();
    resolveReschedule(w, S, open.id, "move");
    expect(w.tasks.find((t) => t.id === open.id)?.dueDate).toBe(addDays(today, 9));
  });

  it("an unconfirmed hearing stays out of confirmed calendar entries until confirmed", () => {
    const text = order(today, addDays(today, 3));
    const ex = demoExtract(text);
    const { job } = createJob(w, S, { doc: doc(text), idempotencyKey: "c", hint: { caseNumber: "", court: "", context: "" }, extraction: ex, error: null });
    const r = approveJob(w, S, job.id, allApproved(ex, { mode: "new", number: "O.S. 482/2025", title: "", court: "", caseType: "" }, false));
    const h = currentHearing(w, r.caseId)!;
    expect(h.status).toBe("awaiting_verification");
    expect(calendarCsv(w)).toContain("[UNCONFIRMED] Hearing");
    confirmHearing(w, S, h.id);
    expect(calendarCsv(w)).toMatch(/"Hearing: O.S. 482\/2025/);
  });

  it("viewers cannot approve orders", () => {
    const text = order(today, null);
    const { job } = createJob(w, S, { doc: doc(text), idempotencyKey: "v", hint: { caseNumber: "", court: "", context: "" }, extraction: demoExtract(text), error: null });
    expect(() => approveJob(w, { ...S, role: "viewer" }, job.id, allApproved(demoExtract(text), { mode: "new", number: "X 1/2025", title: "", court: "", caseType: "" }))).toThrow(PermissionError);
  });
});

describe("demo workspace and research", () => {
  it("loads labelled fictional data and exercises every module", async () => {
    const w = ws();
    await seedDemo(w, S, async (sha) => `office_a/${sha}.txt`);
    expect(w.cases.length).toBeGreaterThanOrEqual(3);
    expect(w.cases.every((c) => c.isDemo)).toBe(true);
    expect(w.jobs.some((j) => j.status === "needs_review")).toBe(true);
    expect(w.dateChanges.length).toBe(1);
    const rep = w.research[0];
    const v1 = rep.versions[0];
    expect(v1.orderIds.length).toBeGreaterThan(0); // report identifies its source orders
    expect(v1.authorities.length).toBeGreaterThan(0);
    expect(v1.authorities.every((a) => a.fictional && a.verification === "fictional_demo" && a.name.includes("FICTIONAL"))).toBe(true);
    expect(v1.authorities.some((a) => a.stance !== "supports")).toBe(true); // contrary material included
    expect(v1.authorities.every((a) => a.sourceId.startsWith("demo-ws"))).toBe(true); // only issue-relevant records
    const d = dashboard(w);
    expect(d.todayHearings.length).toBeGreaterThan(0);
    expect(d.overdue.length).toBeGreaterThan(0);
    expect(d.repeatedAdjournments.length).toBeGreaterThanOrEqual(1);
    clearDemo(w, S);
    expect(w.cases).toHaveLength(0);
  });

  it("loading and then removing the demo never touches the advocate's own cases", async () => {
    const w = ws();
    const mine = createCase(w, S, { number: "O.S. 555/2026", petitioner: "Real Client" });
    await seedDemo(w, S, async (sha) => `office_a/${sha}.txt`);
    expect(w.cases.find((c) => c.id === mine.id)?.isDemo).toBe(false);
    expect(w.cases.filter((c) => c.isDemo)).toHaveLength(3);
    clearDemo(w, S);
    expect(w.cases.map((c) => c.id)).toEqual([mine.id]);
  });

  it("removing the demo keeps the advocate's own uploads but detaches them from removed demo cases", async () => {
    const w = ws();
    await seedDemo(w, S, async (sha) => `office_a/${sha}.txt`);
    const demoCase = w.cases.find((c) => c.isDemo)!;
    const mine = doc("My own upload to a demo case");
    const { job } = createJob(w, S, { doc: { ...mine, caseId: demoCase.id }, idempotencyKey: mine.sha256, hint: { caseNumber: "", court: "", context: "" }, extraction: null, error: "x" });
    clearDemo(w, S);
    const kept = w.documents.find((d) => d.id === mine.id);
    expect(kept).toBeDefined();
    expect(kept!.caseId).toBeNull();
    expect(w.jobs.some((j) => j.id === job.id)).toBe(true);
    expect(w.documents.every((d) => !d.caseId || w.cases.some((c) => c.id === d.caseId))).toBe(true);
  });

  it("research versions are preserved and research tasks need confirmation", async () => {
    const w = ws();
    await seedDemo(w, S, async (sha) => `office_a/${sha}.txt`);
    const rep = w.research[0];
    const v1 = JSON.stringify(rep.versions[0]);
    saveResearchVersion(w, S, rep.caseId, { ...rep.versions[0], question: "rerun" }, rep.id);
    expect(rep.versions).toHaveLength(2);
    expect(JSON.stringify(rep.versions[0])).toBe(v1);
    const step = rep.versions[1].nextSteps[0];
    expect(() => researchAction(w, S, rep.id, 2, { type: "create_task", stepId: step.id, title: step.text, dueDate: null, confirm: false })).toThrow(/Confirm/);
    const before = w.tasks.length;
    researchAction(w, S, rep.id, 2, { type: "create_task", stepId: step.id, title: step.text, dueDate: null, confirm: true });
    researchAction(w, S, rep.id, 2, { type: "create_task", stepId: step.id, title: step.text, dueDate: null, confirm: true });
    expect(w.tasks.length).toBe(before + 1);
    expect(w.tasks.at(-1)?.source).toBe("research");
    researchAction(w, S, rep.id, 2, { type: "review_authority", authorityId: rep.versions[1].authorities[0].id });
    expect(rep.versions[1].authorities[0].verification).toBe("fictional_demo"); // stays labelled fictional
  });
});

describe("storage isolation and concurrency", () => {
  it("one office can never read another office's data", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "advoflow-"));
    const store = new FileStore(dir);
    const A: Session = { ...S, officeId: "office_a" };
    const B: Session = { ...S, officeId: "office_b", userId: "u2" };
    await mutate(store, A, (w) => { createCase(w, A, { number: "O.S. 1/2026", petitioner: "Secret client" }); });
    const wb = await mutate(store, B, (w) => w);
    expect(wb.cases).toHaveLength(0);
    expect(JSON.stringify(await store.load("office_b"))).not.toContain("Secret client");
    await expect(store.load("../office_a")).rejects.toThrow();
  });
  it("concurrent writes are both kept (optimistic retry)", async () => {
    const store = new FileStore(mkdtempSync(path.join(tmpdir(), "advoflow-")));
    await Promise.all([1, 2, 3].map((n) => mutate(store, S, (w) => { createCase(w, S, { number: `O.S. ${n}/2026` }); })));
    expect((await store.load("office_a"))!.cases).toHaveLength(3);
  });
});

describe("security helpers", () => {
  it("passwords are hashed with Argon2id and verified safely", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong password!!")).toBe(false);
    expect(await hashPassword("correct horse battery")).not.toBe(h); // salted
    expect(await verifyPassword("scrypt$old$format", "x")).toBe(false); // malformed or foreign hashes never verify
    expect(normalizeEmail("  Asha.Rao@Example.COM ")).toBe("asha.rao@example.com");
  });
  it("WhatsApp links are encoded", () => {
    expect(whatsappLink("98450 12345", "Next date: 05-11 & more")).toBe("https://wa.me/919845012345?text=Next%20date%3A%2005-11%20%26%20more");
  });
  it("no client-side file references server secrets", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
    walk(path.resolve(__dirname, "../src"));
    for (const f of files.filter((f) => /\.(tsx?|ts)$/.test(f))) {
      const src = readFileSync(f, "utf8");
      if (src.startsWith('"use client"')) expect(src, f).not.toMatch(/ANTHROPIC_API_KEY|AUTH_SECRET|DATABASE_URL|INDIAN_KANOON|lib\/config|lib\/store|lib\/ai\//);
    }
  });
});

describe("demo summary", () => {
  it("summarises the body, not the header", () => {
    const ex = demoExtract("IN THE COURT OF X\nO.S. No. 9/2026\nAsha v. Bina\nDate: 01-10-2026\nPlaintiff present. Defendant absent. Adjourned to 10-10-2026.");
    expect(ex.summary.value).toBe("Plaintiff present. Defendant absent. Adjourned to 10-10-2026.");
  });
});
