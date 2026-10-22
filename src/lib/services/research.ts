import type { ResearchReport, ResearchVersion, Session, Workspace } from "../types";
import { newId, nowISO } from "../util";
import { createTask } from "./cases";
import { audit, NotFoundError, requireRole, ValidationError } from "./workspace";

type Draft = Omit<ResearchVersion, "version" | "notes" | "reviewedAuthorityIds" | "savedAuthorityIds" | "bookmarkedProvisionIds" | "status">;

/** Adds a research run as a NEW version. Earlier versions are never modified or removed. */
export function saveResearchVersion(ws: Workspace, session: Session, caseId: string, draft: Draft, reportId?: string): { report: ResearchReport; version: ResearchVersion } {
  requireRole(session, "advocate");
  const c = ws.cases.find((x) => x.id === caseId);
  if (!c) throw new NotFoundError("Case not found");
  let report = reportId ? ws.research.find((r) => r.id === reportId && r.caseId === caseId) : undefined;
  if (reportId && !report) throw new NotFoundError("Research report not found");
  if (!report) {
    report = { id: newId("rep"), caseId, title: draft.question || `Research on ${c.number}`, createdAt: nowISO(), versions: [] };
    ws.research.push(report);
  }
  const version: ResearchVersion = {
    ...draft,
    version: report.versions.length + 1,
    status: "needs_review",
    notes: [],
    reviewedAuthorityIds: [],
    savedAuthorityIds: [],
    bookmarkedProvisionIds: [],
  };
  report.versions.push(version);
  audit(ws, session, "research.run", "research", report.id, caseId, `v${version.version} · ${version.mode} · ${version.authorities.length} authorities`);
  return { report, version };
}

function getVersion(ws: Workspace, reportId: string, v: number) {
  const report = ws.research.find((r) => r.id === reportId);
  if (!report) throw new NotFoundError("Research report not found");
  const version = report.versions.find((x) => x.version === v);
  if (!version) throw new NotFoundError("Version not found");
  return { report, version };
}

export type ResearchAction =
  | { type: "note"; text: string }
  | { type: "save_authority"; authorityId: string }
  | { type: "bookmark_provision"; provisionId: string }
  | { type: "review_authority"; authorityId: string }
  | { type: "mark_reviewed" }
  | { type: "create_task"; stepId: string; title: string; dueDate: string | null; confirm: boolean };

export function researchAction(ws: Workspace, session: Session, reportId: string, v: number, action: ResearchAction) {
  requireRole(session, "clerk");
  const { report, version } = getVersion(ws, reportId, v);
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  switch (action.type) {
    case "note": {
      const text = action.text.trim();
      if (!text || text.length > 4000) throw new ValidationError("Write a note of up to 4,000 characters.");
      version.notes.push({ id: newId("note"), text, author: "advocate", authorId: session.userId, createdAt: nowISO() });
      break;
    }
    case "save_authority":
      if (!version.authorities.some((a) => a.id === action.authorityId)) throw new NotFoundError("Authority not found");
      version.savedAuthorityIds = toggle(version.savedAuthorityIds, action.authorityId);
      break;
    case "bookmark_provision":
      if (!version.provisions.some((p) => p.id === action.provisionId)) throw new NotFoundError("Provision not found");
      version.bookmarkedProvisionIds = toggle(version.bookmarkedProvisionIds, action.provisionId);
      break;
    case "review_authority": {
      const a = version.authorities.find((x) => x.id === action.authorityId);
      if (!a) throw new NotFoundError("Authority not found");
      version.reviewedAuthorityIds = toggle(version.reviewedAuthorityIds, a.id);
      // A fictional demo record stays labelled fictional even after review.
      if (!a.fictional) a.verification = version.reviewedAuthorityIds.includes(a.id) ? "advocate_reviewed" : "source_retrieved";
      break;
    }
    case "mark_reviewed":
      requireRole(session, "advocate");
      version.status = "reviewed";
      break;
    case "create_task": {
      // Two-step: the UI must send confirm=true after the advocate has seen and edited the task.
      if (!action.confirm) throw new ValidationError("Confirm the task before it is created.");
      const step = version.nextSteps.find((s) => s.id === action.stepId);
      if (!step) throw new NotFoundError("Recommendation not found");
      if (step.taskId) return { taskId: step.taskId };
      const t = createTask(ws, session, { caseId: report.caseId, title: action.title, description: `From research report v${version.version}: ${step.text}`, dueDate: action.dueDate, priority: "normal" }, { source: "research", sourceReportId: report.id });
      step.taskId = t.id;
      return { taskId: t.id };
    }
  }
  audit(ws, session, `research.${action.type}`, "research", report.id, report.caseId, `v${v}`);
  return {};
}
