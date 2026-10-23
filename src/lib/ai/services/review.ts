import type { ApproveInput } from "../../schemas";
import type { Extraction, FieldReview, ProcessingJob, Session, Workspace } from "../../types";
import { owned } from "../../authz";
import { approveJob, currentHearing } from "../../services/orders";
import { requireRole } from "../../services/workspace";
import { UnacknowledgedDifferences } from "../errors";
import { nowISO, slugKey } from "../../util";

// Human approval for AI drafts. A draft (ProcessingJob in "needs_review") never changes a case by itself:
// only confirmExtraction writes, only the fields the advocate approved, and never over a confirmed hearing date
// or a differing court/CNR unless the advocate has seen that difference and acknowledged it.

export interface Difference {
  field: "nextHearingDate" | "court" | "cnr" | "title" | "stage";
  current: string;
  proposed: string;
  /** Protected differences must be acknowledged before confirming (a confirmed date, or the case's identity). */
  protected: boolean;
  note: string;
}

export function differences(ws: Workspace, ex: Extraction | null, caseId: string | null): Difference[] {
  if (!ex || !caseId) return [];
  const c = ws.cases.find((x) => x.id === caseId);
  if (!c) return [];
  const out: Difference[] = [];
  const cur = currentHearing(ws, c.id);
  const next = ex.nextHearingDate.value;
  if (cur && next && cur.date !== next) {
    out.push({
      field: "nextHearingDate", current: cur.date, proposed: next, protected: cur.status === "confirmed",
      note: cur.status === "confirmed"
        ? `The case has a CONFIRMED hearing on ${cur.date}. Confirming this draft with ${next} records a date change; the old date is kept as history.`
        : `The case's hearing on ${cur.date} is awaiting verification; this draft gives ${next}.`,
    });
  }
  if (ex.court.value && c.court && slugKey(ex.court.value) !== slugKey(c.court)) out.push({ field: "court", current: c.court, proposed: ex.court.value, protected: true, note: "The court differs from the case record. The case record is not changed; check this order belongs to this case." });
  if (ex.cnr.value && c.cnr && ex.cnr.value.toUpperCase() !== c.cnr.toUpperCase()) out.push({ field: "cnr", current: c.cnr, proposed: ex.cnr.value, protected: true, note: "The CNR differs from the case record: this may be a different case." });
  if (ex.title.value && c.title && slugKey(ex.title.value) !== slugKey(c.title)) out.push({ field: "title", current: c.title, proposed: ex.title.value, protected: false, note: "The cause title differs; the case record keeps its title." });
  if (ex.stage.value && c.stage && slugKey(ex.stage.value) !== slugKey(c.stage)) out.push({ field: "stage", current: c.stage, proposed: ex.stage.value, protected: false, note: "Approving the stage updates the case's current stage (when this is the latest order)." });
  return out;
}

/** What a reviewer sees. No storage keys, file contents or internal ids beyond what the review needs. */
export function reviewView(ws: Workspace, job: ProcessingJob) {
  const doc = ws.documents.find((d) => d.id === job.documentId);
  const caseId = job.match?.kind === "exact" ? job.match.caseId : null;
  return {
    id: job.id,
    status: job.status === "needs_review" ? "pending_review" : job.status,
    verified: job.status === "approved", // approved by a person; an AI draft on its own is never "verified"
    createdAt: job.createdAt,
    decidedAt: job.decidedAt,
    decidedBy: job.decidedBy,
    document: doc ? { id: doc.id, filename: doc.filename, mime: doc.mime, size: doc.size, textSource: doc.textSource } : null,
    extraction: job.extraction,
    error: job.error,
    match: job.match,
    conflicts: job.conflicts,
    differences: differences(ws, job.extraction, caseId),
    resultOrderId: job.resultOrderId,
  };
}

const same = (a: unknown, b: unknown) => (typeof a === "string" && typeof b === "string" ? a.trim() === b.trim() : a === b);

export function confirmExtraction(ws: Workspace, session: Session, jobId: string, input: ApproveInput, acknowledged: Difference["field"][]) {
  requireRole(session, "advocate");
  const job = owned.job(ws, jobId); // another office's id and a missing id give the same 404
  const ex = job.extraction;
  if (job.status !== "approved") {
    const target = input.caseDecision.mode === "existing" ? owned.case(ws, input.caseDecision.caseId).id : null;
    // Differences only matter for what the advocate is actually approving.
    const diffs = differences(ws, ex && { ...ex, nextHearingDate: { ...ex.nextHearingDate, value: input.fields.nextHearingDate.approved ? input.fields.nextHearingDate.value : null } }, target);
    const unacknowledged = diffs.filter((d) => d.protected && !acknowledged.includes(d.field));
    if (unacknowledged.length) throw new UnacknowledgedDifferences(unacknowledged);
  }
  const res = approveJob(ws, session, jobId, input);
  const order = ws.orders.find((o) => o.id === res.orderId);
  if (order && !res.alreadyApproved) {
    const proposed = (k: string) => (ex as unknown as Record<string, { value: unknown } | undefined>)?.[k]?.value ?? null;
    const review: FieldReview = {
      reviewedBy: session.userId,
      reviewedAt: nowISO(),
      fields: Object.fromEntries(Object.entries(input.fields).map(([k, d]) => [k, !d.approved ? "rejected" : same(d.value, proposed(k)) ? "accepted" : "edited"])),
      tasks: input.tasks.map((t) => {
        const p = ex?.tasks.find((x) => x.key === t.key);
        return { title: t.title, decision: !t.approved ? "rejected" : p && p.title === t.title && p.dueDate === t.dueDate ? "accepted" : "edited" };
      }),
      acknowledgedConflicts: acknowledged,
    };
    order.fieldReview = review;
  }
  return res;
}
