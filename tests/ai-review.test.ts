// Human approval for AI drafts: nothing is written before confirmation, only approved fields are written,
// confirmed dates are never silently overwritten, and only the right people in the right office can confirm.
import { describe, it, expect } from "vitest";
import { emptyWorkspace, NotFoundError, PermissionError } from "@/lib/services/workspace";
import { createJob } from "@/lib/services/orders";
import { confirmExtraction, differences, reviewView } from "@/lib/ai/services/review";
import { UnacknowledgedDifferences } from "@/lib/ai/errors";
import type { ApproveInput } from "@/lib/schemas";
import type { Extraction, Session, Workspace } from "@/lib/types";

const owner: Session = { userId: "u_adv", officeId: "office_a", role: "owner", name: "Adv", mode: "password" };
const clerk: Session = { ...owner, userId: "u_clerk", role: "clerk" };
const now = new Date().toISOString();
const field = <T,>(value: T | null, source: string | null = value === null ? null : "quoted text") => ({ value, status: value === null ? ("missing" as const) : ("stated" as const), source });

function aiDraft(next: string | null): Extraction {
  return {
    caseNumber: field("O.S. No. 4821/2025"), cnr: field(null), title: field("Meera Rao v. Anand Builders Pvt. Ltd."), court: field("City Civil Court, Bengaluru"),
    orderDate: field("2026-10-14"), nextHearingDate: field(next), stage: field("Framing of issues"), summary: { value: "Written statement filed.", status: "inferred", source: null },
    adjourned: field(true), costs: field("Rs. 500 payable to the plaintiff"), directions: ["“The defendant shall deposit Rs. 25,000 within four weeks.”"],
    tasks: [{ key: "file-rejoinder", title: "File rejoinder", dueDate: "2026-11-04", dueBasis: "stated_in_order", priority: "high", source: "quoted" }],
    clientUpdateEn: "", clientUpdateKn: "", confidence: "high", warnings: ["AI draft: unverified."], extractor: "openrouter", model: "google/gemini-3.8-flash",
    ai: { provider: "openrouter", model: "google/gemini-3.8-flash", promptVersion: "court-order.extract.v1", requestId: "req", inputKind: "text", verified: false, usage: { inputTokens: 1, outputTokens: 1, thoughtsTokens: 0, attempts: 1, ms: 1 } },
  };
}

/** An office with one case whose next hearing (2026-11-18) is already CONFIRMED by an advocate. */
function office(id = "office_a"): Workspace {
  const ws = emptyWorkspace(id, "Rao Chambers", []);
  ws.cases.push({
    id: "case_1", number: "O.S. No. 4821/2025", numberKey: "OS|4821|2025", cnr: null, title: "Meera Rao v. Anand Builders Pvt. Ltd.",
    parties: { petitioner: "Meera Rao", respondent: "Anand Builders Pvt. Ltd." }, court: "City Civil Court, Bengaluru", caseType: "OS", stage: "Written statement",
    clientId: null, status: "active", isDemo: false, createdAt: now, updatedAt: now,
  });
  ws.hearings.push({ id: "hear_1", caseId: "case_1", date: "2026-11-18", purpose: "Written statement", status: "confirmed", sourceOrderId: null, supersededById: null, confirmedBy: "u_adv", confirmedAt: now, createdAt: now });
  return ws;
}
function withDraft(ws: Workspace, next: string | null, sha = "sha-ai-1") {
  const doc = { id: `doc_${sha}`, caseId: null, filename: "order.pdf", mime: "application/pdf", size: 10, sha256: sha, storageKey: `office_a/${sha}.pdf`, kind: "order" as const, textExtract: "…", textSource: "pdf_text" as const, isDemo: false, uploadedBy: owner.userId, createdAt: now };
  return createJob(ws, owner, { doc, idempotencyKey: sha, hint: { caseNumber: "", court: "", context: "" }, extraction: aiDraft(next), error: null }).job;
}
function decisions(ex: Extraction, over: Partial<ApproveInput["fields"]> = {}): ApproveInput {
  const f = <T,>(v: { value: T | null }) => ({ approved: v.value !== null, value: v.value });
  return {
    caseDecision: { mode: "existing", caseId: "case_1" },
    fields: { orderDate: f(ex.orderDate), nextHearingDate: f(ex.nextHearingDate), stage: f(ex.stage), summary: f(ex.summary), adjourned: f(ex.adjourned), costs: f(ex.costs), court: f(ex.court), title: f(ex.title), ...over },
    confirmHearing: true,
    directions: ex.directions,
    tasks: ex.tasks.map((t) => ({ key: t.key, approved: true, title: t.title, dueDate: t.dueDate, priority: t.priority })),
  };
}
const snapshot = (ws: Workspace) => JSON.stringify({ cases: ws.cases, hearings: ws.hearings, orders: ws.orders, tasks: ws.tasks, clientUpdates: ws.clientUpdates });

describe("7. an extraction does not write to the case", () => {
  it("creates only a pending draft; the case, hearings, orders, tasks and client messages are untouched", () => {
    const ws = office();
    const before = snapshot(ws);
    const job = withDraft(ws, "2026-11-25");
    expect(job.status).toBe("needs_review");
    expect(snapshot(ws)).toBe(before);
    const view = reviewView(ws, job);
    expect(view).toMatchObject({ status: "pending_review", verified: false, match: { kind: "exact", caseId: "case_1" } });
    expect(JSON.stringify(view)).not.toContain("storageKey");
  });

  it("writes only the fields the advocate approved, and records accepted / edited / rejected", () => {
    const ws = office();
    const job = withDraft(ws, "2026-11-18"); // same as the confirmed hearing: no conflict
    const input = decisions(job.extraction!, {
      stage: { approved: false, value: "Framing of issues" }, // rejected
      costs: { approved: false, value: "Rs. 500 payable to the plaintiff" }, // rejected
      summary: { approved: true, value: "Written statement filed; rejoinder awaited." }, // edited
    });
    input.tasks[0] = { ...input.tasks[0], approved: false };
    const res = confirmExtraction(ws, owner, job.id, input, []);
    const order = ws.orders.find((o) => o.id === res.orderId)!;
    expect(ws.cases[0].stage).toBe("Written statement"); // rejected stage not applied
    expect(order.stage).toBe("");
    expect(order.costs).toBeNull();
    expect(order.summary).toBe("Written statement filed; rejoinder awaited.");
    expect(ws.tasks).toHaveLength(0); // rejected task not created
    expect(order.fieldReview).toMatchObject({
      reviewedBy: "u_adv",
      fields: { stage: "rejected", costs: "rejected", summary: "edited", orderDate: "accepted", nextHearingDate: "accepted", court: "accepted" },
      tasks: [{ title: "File rejoinder", decision: "rejected" }],
    });
    expect(order.approvedBy).toBe("u_adv");
    expect(order.documentId).toBe(job.documentId); // source document reference
    expect(order.extractionSnapshot?.ai?.verified).toBe(false); // the AI proposal is kept as proposed
    expect(ws.jobs[0]).toMatchObject({ status: "approved", decidedBy: "u_adv" });
  });
});

describe("8. confirmation needs the right person in the right office", () => {
  it("a clerk cannot confirm", () => {
    const ws = office();
    const job = withDraft(ws, "2026-11-18");
    expect(() => confirmExtraction(ws, clerk, job.id, decisions(job.extraction!), [])).toThrow(PermissionError);
    expect(ws.orders).toHaveLength(0);
  });
  it("another office cannot see or confirm the draft (same 404 as a missing id)", () => {
    const a = office("office_a");
    const job = withDraft(a, "2026-11-18");
    const b = office("office_b");
    const other: Session = { ...owner, userId: "u_other", officeId: "office_b" };
    expect(() => confirmExtraction(b, other, job.id, decisions(job.extraction!), [])).toThrow(NotFoundError);
    expect(() => confirmExtraction(b, other, "job_does_not_exist", decisions(job.extraction!), [])).toThrow(NotFoundError);
  });
  it("cannot attach a draft to a case of another office", () => {
    const ws = office();
    const job = withDraft(ws, "2026-11-18");
    const input = { ...decisions(job.extraction!), caseDecision: { mode: "existing" as const, caseId: "case_in_other_office" } };
    expect(() => confirmExtraction(ws, owner, job.id, input, [])).toThrow(NotFoundError);
  });
  it("confirming twice returns the first result and writes nothing more", () => {
    const ws = office();
    const job = withDraft(ws, "2026-11-18");
    const first = confirmExtraction(ws, owner, job.id, decisions(job.extraction!), []);
    const after = snapshot(ws);
    const again = confirmExtraction(ws, owner, job.id, decisions(job.extraction!), []);
    expect(again).toMatchObject({ orderId: first.orderId, alreadyApproved: true });
    expect(snapshot(ws)).toBe(after);
  });
});

describe("9. confirmed dates are not silently overwritten", () => {
  it("a different next date than a CONFIRMED hearing is refused until acknowledged; nothing is written", () => {
    const ws = office();
    const job = withDraft(ws, "2026-11-25");
    const d = differences(ws, job.extraction, "case_1");
    expect(d.filter((x) => x.protected)).toEqual([expect.objectContaining({ field: "nextHearingDate", current: "2026-11-18", proposed: "2026-11-25" })]);
    expect(d.find((x) => x.field === "stage")).toMatchObject({ protected: false }); // shown, but only informational
    const before = snapshot(ws);
    let err: unknown;
    try { confirmExtraction(ws, owner, job.id, decisions(job.extraction!), []); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(UnacknowledgedDifferences);
    expect((err as UnacknowledgedDifferences).differences[0].field).toBe("nextHearingDate");
    expect(snapshot(ws)).toBe(before);
  });
  it("after acknowledging, the change is recorded with the old date kept as history", () => {
    const ws = office();
    const job = withDraft(ws, "2026-11-25");
    const res = confirmExtraction(ws, owner, job.id, decisions(job.extraction!), ["nextHearingDate"]);
    const old = ws.hearings.find((h) => h.id === "hear_1")!;
    expect(old.status).toBe("superseded");
    expect(ws.hearings.find((h) => h.date === "2026-11-25")).toMatchObject({ status: "confirmed", confirmedBy: "u_adv" });
    expect(ws.dateChanges[0]).toMatchObject({ from: "2026-11-18", to: "2026-11-25" });
    expect(ws.orders.find((o) => o.id === res.orderId)?.fieldReview?.acknowledgedConflicts).toEqual(["nextHearingDate"]);
  });
  it("rejecting the proposed date avoids the conflict and keeps the confirmed hearing", () => {
    const ws = office();
    const job = withDraft(ws, "2026-11-25");
    confirmExtraction(ws, owner, job.id, decisions(job.extraction!, { nextHearingDate: { approved: false, value: "2026-11-25" } }), []);
    expect(ws.hearings.find((h) => h.id === "hear_1")?.status).toBe("confirmed");
    expect(ws.hearings).toHaveLength(1);
  });
  it("a different court is a protected difference; the case record keeps its court", () => {
    const ws = office();
    const job = withDraft(ws, "2026-11-18");
    job.extraction!.court.value = "Principal Civil Judge, Mysuru";
    expect(() => confirmExtraction(ws, owner, job.id, decisions(job.extraction!), [])).toThrow(UnacknowledgedDifferences);
    confirmExtraction(ws, owner, job.id, decisions(job.extraction!), ["court"]);
    expect(ws.cases[0].court).toBe("City Civil Court, Bengaluru");
  });
});
