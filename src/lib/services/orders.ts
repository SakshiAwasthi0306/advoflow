import type { ApproveInput } from "../schemas";
import type { CaseMatch, CaseRecord, CourtOrder, DocumentRecord, Extraction, Hearing, ProcessingJob, Session, Task, Workspace } from "../types";
import { caseNumberKey, newId, nowISO, sha256, slugKey } from "../util";
import { clientUpdateEn, clientUpdateKn } from "../messages";
import { audit, NotFoundError, requireRole, ValidationError } from "./workspace";
import { titleFromParties } from "./cases";
import { owned } from "../authz";

const liveCases = (ws: Workspace) => ws.cases.filter((c) => c.status !== "archived");

/**
 * Find the case an order belongs to. Only an exact CNR or exact normalised case number
 * counts as a match; anything looser is returned as "ambiguous" for the advocate to resolve.
 */
export function matchCase(ws: Workspace, ex: Extraction | null, hintNumber: string): CaseMatch {
  const cases = liveCases(ws);
  const cnr = ex?.cnr.value?.toUpperCase() ?? null;
  if (cnr) {
    const hit = cases.filter((c) => c.cnr && c.cnr.toUpperCase() === cnr);
    if (hit.length === 1) return { kind: "exact", caseId: hit[0].id, candidates: [{ caseId: hit[0].id, number: hit[0].number, title: hit[0].title, reason: "Same CNR number" }] };
  }
  const key = caseNumberKey(ex?.caseNumber.value) ?? caseNumberKey(hintNumber);
  const candidates: CaseMatch["candidates"] = [];
  if (key) {
    const exact = cases.filter((c) => c.numberKey === key);
    if (exact.length === 1) {
      // A clash with the CNR or parties still needs a human decision.
      const c = exact[0];
      if (cnr && c.cnr && c.cnr.toUpperCase() !== cnr) {
        return { kind: "ambiguous", caseId: null, candidates: [{ caseId: c.id, number: c.number, title: c.title, reason: "Same case number but a different CNR" }] };
      }
      return { kind: "exact", caseId: c.id, candidates: [{ caseId: c.id, number: c.number, title: c.title, reason: "Same case type, number and year" }] };
    }
    if (exact.length > 1) {
      return { kind: "ambiguous", caseId: null, candidates: exact.map((c) => ({ caseId: c.id, number: c.number, title: c.title, reason: "Same case number" })) };
    }
    const [, num, year] = key.split("|");
    for (const c of cases) {
      if (!c.numberKey) continue;
      const [, n2, y2] = c.numberKey.split("|");
      if (n2 === num && y2 === year) candidates.push({ caseId: c.id, number: c.number, title: c.title, reason: "Same number and year, different case type" });
      else if (n2 === num && c.numberKey.split("|")[0] === key.split("|")[0]) candidates.push({ caseId: c.id, number: c.number, title: c.title, reason: "Same type and number, different year" });
    }
  }
  const title = ex?.title.value?.toLowerCase();
  if (title) {
    const words = title.split(/\W+/).filter((w) => w.length > 3);
    for (const c of cases) {
      if (candidates.some((x) => x.caseId === c.id)) continue;
      const t = c.title.toLowerCase();
      if (words.length && words.filter((w) => t.includes(w)).length >= Math.min(2, words.length)) candidates.push({ caseId: c.id, number: c.number, title: c.title, reason: "Similar party names" });
    }
  }
  return candidates.length ? { kind: "ambiguous", caseId: null, candidates } : { kind: "none", caseId: null, candidates: [] };
}

export function currentHearing(ws: Workspace, caseId: string): Hearing | null {
  const hs = ws.hearings.filter((h) => h.caseId === caseId && (h.status === "confirmed" || h.status === "awaiting_verification"));
  hs.sort((a, b) => b.date.localeCompare(a.date));
  return hs[0] ?? null;
}

export function latestOrder(ws: Workspace, caseId: string): CourtOrder | null {
  const os = ws.orders.filter((o) => o.caseId === caseId);
  os.sort((a, b) => (b.orderDate ?? "").localeCompare(a.orderDate ?? "") || b.approvedAt.localeCompare(a.approvedAt));
  return os[0] ?? null;
}

export function findConflicts(ws: Workspace, ex: Extraction | null, match: CaseMatch, doc: DocumentRecord): string[] {
  const out: string[] = [];
  if (ws.orders.some((o) => ws.documents.find((d) => d.id === o.documentId)?.sha256 === doc.sha256)) out.push("This exact document has already been approved as an order.");
  if (!ex || match.kind !== "exact" || !match.caseId) return out;
  const c = ws.cases.find((x) => x.id === match.caseId)!;
  if (ex.court.value && c.court && slugKey(ex.court.value) !== slugKey(c.court)) out.push(`Court differs from the case record ("${c.court}").`);
  const cur = currentHearing(ws, c.id);
  if (cur && ex.nextHearingDate.value && cur.date !== ex.nextHearingDate.value) {
    out.push(`The case's current hearing is ${cur.date} (${cur.status === "confirmed" ? "confirmed" : "awaiting verification"}); this order gives ${ex.nextHearingDate.value}. Approving it will record a date change.`);
  }
  const last = latestOrder(ws, c.id);
  if (last?.orderDate && ex.orderDate.value && ex.orderDate.value < last.orderDate) out.push(`This order (${ex.orderDate.value}) is older than the latest approved order (${last.orderDate}). It will be added to the history without changing the current stage or hearing.`);
  if (last?.orderDate && ex.orderDate.value === last.orderDate) out.push("An order with the same date is already in this case's history. Check this is not a duplicate.");
  return out;
}

/** Create (or return the existing) review job. Re-submitting the same order never creates a second job. */
export function createJob(
  ws: Workspace,
  session: Session,
  args: { doc: DocumentRecord; idempotencyKey: string; hint: ProcessingJob["hint"]; extraction: Extraction | null; error: string | null },
): { job: ProcessingJob; reused: boolean } {
  requireRole(session, "clerk");
  const existing = ws.jobs.find((j) => j.idempotencyKey === args.idempotencyKey && j.status !== "failed" && j.status !== "rejected");
  if (existing) return { job: existing, reused: true };
  if (!ws.documents.some((d) => d.id === args.doc.id)) ws.documents.push(args.doc);
  const match = matchCase(ws, args.extraction, args.hint.caseNumber);
  const job: ProcessingJob = {
    id: newId("job"),
    documentId: args.doc.id,
    idempotencyKey: args.idempotencyKey,
    hint: args.hint,
    status: args.error && !args.extraction ? "failed" : "needs_review",
    error: args.error,
    extraction: args.extraction,
    match,
    conflicts: findConflicts(ws, args.extraction, match, args.doc),
    createdBy: session.userId,
    createdAt: nowISO(),
    decidedAt: null,
    decidedBy: null,
    resultOrderId: null,
  };
  ws.jobs.push(job);
  audit(ws, session, "order.uploaded", "job", job.id, match.caseId, args.doc.filename);
  return { job, reused: false };
}

export function rejectJob(ws: Workspace, session: Session, jobId: string) {
  requireRole(session, "clerk");
  const job = owned.job(ws, jobId);
  if (job.status === "approved") throw new ValidationError("This order was already approved; it cannot be rejected now.");
  job.status = "rejected";
  job.decidedAt = nowISO();
  job.decidedBy = session.userId;
  audit(ws, session, "order.rejected", "job", job.id, job.match?.caseId ?? null, "Proposed update rejected; confirmed records unchanged");
}

/** Reopen a failed or rejected job for manual entry. The original document is kept throughout. */
export function reopenJob(ws: Workspace, session: Session, jobId: string) {
  requireRole(session, "clerk");
  const job = owned.job(ws, jobId);
  if (job.status === "approved") return job;
  job.status = "needs_review";
  return job;
}

/**
 * Commit an advocate-approved order. Everything below happens on one in-memory workspace
 * that is saved in a single transaction, so the order, hearing, tasks and drafts land together.
 * Approving the same job twice returns the first result (idempotent).
 */
export function approveJob(ws: Workspace, session: Session, jobId: string, input: ApproveInput): { orderId: string; caseId: string; alreadyApproved: boolean } {
  requireRole(session, "advocate");
  const job = owned.job(ws, jobId);
  if (job.status === "approved" && job.resultOrderId) {
    const o = ws.orders.find((x) => x.id === job.resultOrderId)!;
    return { orderId: o.id, caseId: o.caseId, alreadyApproved: true };
  }
  if (job.status === "rejected") throw new ValidationError("This proposal was rejected. Reopen it before approving.");
  const doc = ws.documents.find((d) => d.id === job.documentId);
  if (!doc) throw new NotFoundError("The original document is missing");
  const dupOrder = ws.orders.find((o) => o.documentId === doc.id);
  if (dupOrder) {
    job.status = "approved";
    job.resultOrderId = dupOrder.id;
    return { orderId: dupOrder.id, caseId: dupOrder.caseId, alreadyApproved: true };
  }

  const f = input.fields;
  const val = <T,>(d: { approved: boolean; value: T | null }) => (d.approved ? d.value : null);

  // 1. Case
  let c: CaseRecord;
  if (input.caseDecision.mode === "existing") {
    const found = owned.case(ws, (input.caseDecision as { caseId: string }).caseId);
    if (found.status === "archived") throw new NotFoundError("Case not found");
    c = found;
  } else {
    const d = input.caseDecision;
    const key = caseNumberKey(d.number);
    const clash = key ? liveCases(ws).find((x) => x.numberKey === key) : null;
    if (clash) throw new ValidationError(`Case ${clash.number} already exists. Choose it instead of creating a duplicate.`);
    const now = nowISO();
    const [pet, res] = (val(f.title) ?? d.title).split(/\s+(?:v\.|vs\.?|versus)\s+/i);
    c = {
      id: newId("case"), number: d.number, numberKey: key, cnr: job.extraction?.cnr.value ?? null,
      title: val(f.title) ?? d.title, parties: { petitioner: pet?.trim() ?? "", respondent: res?.trim() ?? "" },
      court: val(f.court) ?? d.court, caseType: d.caseType || (key ? key.split("|")[0] : ""), stage: "", clientId: null,
      status: "active", isDemo: false, createdAt: now, updatedAt: now,
    };
    if (!c.title) c.title = titleFromParties(c.parties);
    ws.cases.push(c);
    audit(ws, session, "case.created", "case", c.id, c.id, `Created from order review: ${c.number}`);
  }

  // 2. Order record (only approved fields)
  const orderDate = val(f.orderDate);
  const nextDate = val(f.nextHearingDate);
  const prevLatest = latestOrder(ws, c.id);
  const isLatest = !prevLatest || !prevLatest.orderDate || !orderDate || orderDate >= prevLatest.orderDate;
  const order: CourtOrder = {
    id: newId("ord"), caseId: c.id, documentId: doc.id, jobId: job.id,
    orderDate, summary: val(f.summary) ?? "", stage: val(f.stage) ?? "", adjourned: val(f.adjourned) ?? false,
    costs: val(f.costs), directions: input.directions, nextHearingDate: nextDate,
    nextHearingConfirmed: !!nextDate && input.confirmHearing,
    approvedFields: Object.entries(f).filter(([, v]) => v.approved).map(([k]) => k),
    extractionSnapshot: job.extraction, approvedBy: session.userId, approvedAt: nowISO(), isDemo: false,
  };
  ws.orders.push(order);
  doc.caseId = c.id;
  if (val(f.court) && !c.court) c.court = val(f.court)!;
  if (val(f.title) && !c.title) c.title = val(f.title)!;
  if (!c.cnr && job.extraction?.cnr.value) c.cnr = job.extraction.cnr.value;
  if (isLatest && order.stage) c.stage = order.stage;
  c.updatedAt = nowISO();

  // 3. Hearings: the previous current hearing is held or superseded, never deleted.
  if (nextDate && isLatest) applyNextHearing(ws, session, c.id, nextDate, order, input.confirmHearing);

  // 4. Approved tasks, de-duplicated by document + task so retries never double them.
  for (const t of input.tasks.filter((t) => t.approved)) {
    const dedupeKey = sha256(`${doc.sha256}|${slugKey(t.title)}`).slice(0, 24);
    if (ws.tasks.some((x) => x.caseId === c.id && x.dedupeKey === dedupeKey)) continue;
    const task: Task = {
      id: newId("task"), caseId: c.id, title: t.title, description: "", dueDate: t.dueDate, priority: t.priority,
      status: "open", source: "order", sourceOrderId: order.id, sourceReportId: null, dedupeKey, assigneeId: null,
      needsReschedule: null, createdBy: session.userId, createdAt: nowISO(), completedAt: null,
    };
    ws.tasks.push(task);
  }

  // 5. Client update drafts from approved data only: English, plus Kannada when the client prefers it (or no client
  //    is linked yet). Any other language is drafted on request from the case's Client tab (AI, from confirmed facts).
  const client = ws.clients.find((x) => x.id === c.clientId) ?? null;
  for (const lang of !client || client.preferredLanguage === "kn" ? (["en", "kn"] as const) : (["en"] as const)) {
    if (ws.clientUpdates.some((u) => u.sourceOrderId === order.id && u.lang === lang)) continue;
    ws.clientUpdates.push({
      id: newId("cu"), caseId: c.id, clientId: client?.id ?? null, lang,
      text: lang === "en" ? clientUpdateEn(c, order, client, ws.office.name) : clientUpdateKn(c, order, client, ws.office.name),
      status: "draft", sourceOrderId: order.id, createdAt: nowISO(), updatedAt: nowISO(), handedOffAt: null, origin: "template",
    });
  }

  job.status = "approved";
  job.resultOrderId = order.id;
  job.decidedAt = nowISO();
  job.decidedBy = session.userId;
  audit(ws, session, "order.approved", "order", order.id, c.id, `Fields approved: ${order.approvedFields.join(", ") || "none"}`);
  return { orderId: order.id, caseId: c.id, alreadyApproved: false };
}

function applyNextHearing(ws: Workspace, session: Session, caseId: string, date: string, order: CourtOrder, confirm: boolean) {
  const cur = currentHearing(ws, caseId);
  const same = ws.hearings.find((h) => h.caseId === caseId && h.date === date && (h.status === "confirmed" || h.status === "awaiting_verification"));
  if (same) {
    same.sourceOrderId = order.id;
    if (confirm && same.status !== "confirmed") Object.assign(same, { status: "confirmed", confirmedBy: session.userId, confirmedAt: nowISO() });
    return;
  }
  const h: Hearing = {
    id: newId("hear"), caseId, date, purpose: order.stage, status: confirm ? "confirmed" : "awaiting_verification",
    sourceOrderId: order.id, supersededById: null, confirmedBy: confirm ? session.userId : null, confirmedAt: confirm ? nowISO() : null, createdAt: nowISO(),
  };
  ws.hearings.push(h);
  if (!cur) return;
  if (order.orderDate && order.orderDate >= cur.date) {
    // The earlier hearing took place; this order fixes the next one.
    cur.status = "held";
    return;
  }
  // The order moves a hearing that has not happened yet: keep the old date as history.
  cur.status = "superseded";
  cur.supersededById = h.id;
  const affected = ws.tasks.filter((t) => t.caseId === caseId && t.status === "open" && t.dueDate === cur.date);
  for (const t of affected) t.needsReschedule = { from: cur.date, to: date };
  ws.dateChanges.push({ id: newId("chg"), caseId, from: cur.date, to: date, orderId: order.id, at: nowISO(), affectedTaskIds: affected.map((t) => t.id), reviewed: affected.length === 0 });
  audit(ws, session, "hearing.date_changed", "hearing", h.id, caseId, `${cur.date} → ${date}; ${affected.length} open task(s) need review`);
}

export function confirmHearing(ws: Workspace, session: Session, hearingId: string, date?: string) {
  requireRole(session, "advocate");
  const h = owned.hearing(ws, hearingId);
  if (h.status !== "awaiting_verification") throw new ValidationError("Only hearings awaiting verification can be confirmed.");
  if (date && date !== h.date) {
    // Correcting the date: keep the proposed one as superseded history.
    const nh: Hearing = { ...h, id: newId("hear"), date, status: "confirmed", confirmedBy: session.userId, confirmedAt: nowISO(), createdAt: nowISO() };
    h.status = "superseded";
    h.supersededById = nh.id;
    ws.hearings.push(nh);
    audit(ws, session, "hearing.corrected", "hearing", nh.id, h.caseId, `${h.date} corrected to ${date} and confirmed`);
    return nh;
  }
  Object.assign(h, { status: "confirmed", confirmedBy: session.userId, confirmedAt: nowISO() });
  const o = ws.orders.find((x) => x.id === h.sourceOrderId);
  if (o && o.nextHearingDate === h.date) o.nextHearingConfirmed = true;
  audit(ws, session, "hearing.confirmed", "hearing", h.id, h.caseId, h.date);
  return h;
}

export function cancelHearing(ws: Workspace, session: Session, hearingId: string) {
  requireRole(session, "advocate");
  const h = owned.hearing(ws, hearingId);
  h.status = "cancelled";
  audit(ws, session, "hearing.cancelled", "hearing", h.id, h.caseId, h.date);
}

/** The advocate decides, task by task, whether a date change moves the task. */
export function resolveReschedule(ws: Workspace, session: Session, taskId: string, action: "move" | "keep") {
  requireRole(session, "clerk");
  const t = owned.task(ws, taskId);
  if (!t.needsReschedule) throw new NotFoundError("Nothing to reschedule");
  if (t.status === "done") throw new ValidationError("Completed tasks are never rescheduled.");
  const { from, to } = t.needsReschedule;
  if (action === "move") t.dueDate = to;
  t.needsReschedule = null;
  for (const ch of ws.dateChanges) if (ch.affectedTaskIds.includes(t.id) && ch.affectedTaskIds.every((id) => !ws.tasks.find((x) => x.id === id)?.needsReschedule)) ch.reviewed = true;
  audit(ws, session, action === "move" ? "task.rescheduled" : "task.kept_date", "task", t.id, t.caseId, `${from} → ${action === "move" ? to : from}`);
}
