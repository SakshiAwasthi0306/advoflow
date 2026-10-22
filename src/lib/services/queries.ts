import type { CaseRecord, Hearing, Task, Workspace } from "../types";
import { addDays, csvCell, daysBetween, todayIST } from "../util";
import { currentHearing, latestOrder } from "./orders";

// Read-side helpers. Every number on the dashboard and reports comes from these, i.e. from stored records.

export function caseSummary(ws: Workspace, c: CaseRecord, today = todayIST()) {
  const hearing = currentHearing(ws, c.id);
  const tasks = ws.tasks.filter((t) => t.caseId === c.id);
  const openTasks = tasks.filter((t) => t.status === "open");
  const pendingReview = ws.jobs.filter((j) => j.status === "needs_review" && j.match?.caseId === c.id).length;
  const unconfirmed = hearing?.status === "awaiting_verification";
  const adjournments = ws.orders.filter((o) => o.caseId === c.id && o.adjourned).length;
  const reports = ws.research.filter((r) => r.caseId === c.id);
  const lastVersion = reports.flatMap((r) => r.versions).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return {
    hearing,
    openTasks: openTasks.length,
    overdue: openTasks.filter((t) => t.dueDate && t.dueDate < today).length,
    verification: pendingReview ? ("needs_review" as const) : unconfirmed ? ("unconfirmed_date" as const) : ("verified" as const),
    pendingReview,
    adjournments,
    latestOrder: latestOrder(ws, c.id),
    researchStatus: lastVersion ? lastVersion.status : null,
  };
}

export function dashboard(ws: Workspace, today = todayIST()) {
  const live = ws.cases.filter((c) => c.status === "active");
  const liveIds = new Set(live.map((c) => c.id));
  const hearings = ws.hearings.filter((h) => liveIds.has(h.caseId) && (h.status === "confirmed" || h.status === "awaiting_verification"));
  const open = ws.tasks.filter((t) => t.status === "open" && liveIds.has(t.caseId));
  return {
    todayHearings: hearings.filter((h) => h.date === today),
    weekHearings: hearings.filter((h) => h.date > today && h.date <= addDays(today, 7)).sort((a, b) => a.date.localeCompare(b.date)),
    dueToday: open.filter((t) => t.dueDate === today),
    overdue: open.filter((t) => t.dueDate && t.dueDate < today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)),
    needsReschedule: open.filter((t) => t.needsReschedule),
    awaitingReview: ws.jobs.filter((j) => j.status === "needs_review"),
    failedJobs: ws.jobs.filter((j) => j.status === "failed"),
    unconfirmedHearings: hearings.filter((h) => h.status === "awaiting_verification"),
    dateChanges: ws.dateChanges.filter((d) => liveIds.has(d.caseId) && d.to >= today).sort((a, b) => b.at.localeCompare(a.at)),
    repeatedAdjournments: live
      .map((c) => ({ c, n: ws.orders.filter((o) => o.caseId === c.id && o.adjourned).length }))
      .filter((x) => x.n >= 3)
      .sort((a, b) => b.n - a.n),
    researchToReview: ws.research.filter((r) => liveIds.has(r.caseId) && r.versions.at(-1)?.status === "needs_review"),
    recent: [...ws.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10),
    caseCount: live.length,
  };
}

export function dueLabel(due: string | null, today = todayIST()): { text: string; tone: "overdue" | "soon" | "normal" | "none" } {
  if (!due) return { text: "No due date", tone: "none" };
  const n = daysBetween(today, due);
  if (n < 0) return { text: `Overdue by ${-n} day${n === -1 ? "" : "s"}`, tone: "overdue" };
  if (n === 0) return { text: "Due today", tone: "soon" };
  if (n <= 3) return { text: `Due in ${n} day${n === 1 ? "" : "s"}`, tone: "soon" };
  return { text: `Due in ${n} days`, tone: "normal" };
}

export interface CalendarItem {
  date: string;
  kind: "hearing" | "deadline";
  status: Hearing["status"] | "open" | "done";
  caseId: string;
  caseNumber: string;
  title: string;
  id: string;
}

export function calendarItems(ws: Workspace, opts: { includeSuperseded?: boolean } = {}): CalendarItem[] {
  const caseOf = new Map(ws.cases.map((c) => [c.id, c]));
  const items: CalendarItem[] = [];
  for (const h of ws.hearings) {
    const c = caseOf.get(h.caseId);
    if (!c || c.status === "archived") continue;
    if (!opts.includeSuperseded && (h.status === "superseded" || h.status === "cancelled")) continue;
    items.push({ date: h.date, kind: "hearing", status: h.status, caseId: c.id, caseNumber: c.number, title: h.purpose ? `Hearing: ${h.purpose}` : "Hearing", id: h.id });
  }
  for (const t of ws.tasks as Task[]) {
    const c = caseOf.get(t.caseId);
    if (!c || c.status === "archived" || !t.dueDate) continue;
    items.push({ date: t.dueDate, kind: "deadline", status: t.status, caseId: c.id, caseNumber: c.number, title: t.title, id: t.id });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/** Google Calendar-compatible CSV. Unconfirmed items are labelled so they are never mistaken for confirmed hearings. */
export function calendarCsv(ws: Workspace, from = todayIST()): string {
  const rows = [["Subject", "Start Date", "All Day Event", "Description"]];
  for (const i of calendarItems(ws)) {
    if (i.date < from || i.status === "done" || i.status === "held") continue;
    const [y, m, d] = i.date.split("-");
    const label = i.kind === "hearing" ? (i.status === "confirmed" ? "Hearing" : "[UNCONFIRMED] Hearing") : "Deadline";
    rows.push([`${label}: ${i.caseNumber} – ${i.title}`, `${m}/${d}/${y}`, "True", i.kind === "hearing" && i.status !== "confirmed" ? "Date awaiting advocate verification" : ""]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
