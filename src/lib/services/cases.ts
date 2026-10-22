import { z } from "zod";
import { caseInputSchema, clientInputSchema, taskInputSchema } from "../schemas";
import type { CaseRecord, Client, ClientUpdate, Session, Task, Workspace } from "../types";
import { caseNumberKey, newId, nowISO } from "../util";
import { audit, NotFoundError, requireRole, ValidationError } from "./workspace";
import { owned } from "../authz";

export const titleFromParties = (p: { petitioner: string; respondent: string }) =>
  p.petitioner && p.respondent ? `${p.petitioner} v. ${p.respondent}` : p.petitioner || p.respondent || "";

export function findDuplicates(ws: Workspace, number: string, excludeId?: string): CaseRecord[] {
  const key = caseNumberKey(number);
  if (!key) return [];
  return ws.cases.filter((c) => c.id !== excludeId && c.status !== "archived" && c.numberKey === key);
}

export function createCase(ws: Workspace, session: Session, raw: unknown): CaseRecord {
  requireRole(session, "clerk");
  const input = caseInputSchema.parse(raw);
  const dups = findDuplicates(ws, input.number);
  if (dups.length) throw new ValidationError(`Case ${dups[0].number} already exists in this office. Open it instead of creating a duplicate.`);
  if (input.clientId) owned.client(ws, input.clientId);
  const now = nowISO();
  const parties = { petitioner: input.petitioner, respondent: input.respondent };
  const c: CaseRecord = {
    id: newId("case"), number: input.number, numberKey: caseNumberKey(input.number), cnr: input.cnr ? input.cnr.toUpperCase() : null,
    title: titleFromParties(parties), parties, court: input.court, caseType: input.caseType || (caseNumberKey(input.number)?.split("|")[0] ?? ""),
    stage: input.stage, clientId: input.clientId ?? null, status: "active", isDemo: false, createdAt: now, updatedAt: now,
  };
  ws.cases.push(c);
  audit(ws, session, "case.created", "case", c.id, c.id, c.number);
  return c;
}

export function updateCase(ws: Workspace, session: Session, id: string, raw: unknown): CaseRecord {
  requireRole(session, "clerk");
  const c = owned.case(ws, id);
  const input = caseInputSchema.parse(raw);
  const dups = findDuplicates(ws, input.number, id);
  if (dups.length) throw new ValidationError(`Another case already uses the number ${dups[0].number}.`);
  if (input.clientId) owned.client(ws, input.clientId);
  const before = JSON.stringify({ n: c.number, court: c.court, stage: c.stage });
  Object.assign(c, {
    number: input.number, numberKey: caseNumberKey(input.number), cnr: input.cnr ? input.cnr.toUpperCase() : null,
    parties: { petitioner: input.petitioner, respondent: input.respondent }, court: input.court,
    caseType: input.caseType, stage: input.stage, clientId: input.clientId ?? null, updatedAt: nowISO(),
  });
  c.title = titleFromParties(c.parties);
  audit(ws, session, "case.updated", "case", c.id, c.id, `${before} → ${JSON.stringify({ n: c.number, court: c.court, stage: c.stage })}`);
  return c;
}

export function setCaseStatus(ws: Workspace, session: Session, id: string, status: CaseRecord["status"]) {
  requireRole(session, "advocate");
  const c = owned.case(ws, id);
  if (status === "active" && c.numberKey && findDuplicates(ws, c.number, id).length) throw new ValidationError("Another live case uses this number.");
  c.status = status;
  c.updatedAt = nowISO();
  audit(ws, session, `case.${status}`, "case", c.id, c.id, c.number);
}

// ---- Tasks ----------------------------------------------------------------

export function createTask(ws: Workspace, session: Session, raw: unknown, source: Partial<Pick<Task, "source" | "sourceReportId" | "sourceOrderId">> = {}): Task {
  requireRole(session, "clerk");
  const input = taskInputSchema.parse(raw);
  owned.case(ws, input.caseId);
  const t: Task = {
    id: newId("task"), caseId: input.caseId, title: input.title, description: input.description, dueDate: input.dueDate,
    priority: input.priority, status: "open", source: source.source ?? "manual", sourceOrderId: source.sourceOrderId ?? null,
    sourceReportId: source.sourceReportId ?? null, dedupeKey: null, assigneeId: null, needsReschedule: null,
    createdBy: session.userId, createdAt: nowISO(), completedAt: null,
  };
  ws.tasks.push(t);
  audit(ws, session, "task.created", "task", t.id, t.caseId, t.title);
  return t;
}

const taskPatch = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  dueDate: taskInputSchema.shape.dueDate.optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
  status: z.enum(["open", "done"]).optional(),
});

export function updateTask(ws: Workspace, session: Session, id: string, raw: unknown): Task {
  requireRole(session, "clerk");
  const t = owned.task(ws, id);
  const p = taskPatch.parse(raw);
  if (p.status && p.status !== t.status) {
    t.status = p.status;
    t.completedAt = p.status === "done" ? nowISO() : null;
    if (p.status === "done") t.needsReschedule = null;
    audit(ws, session, p.status === "done" ? "task.completed" : "task.reopened", "task", t.id, t.caseId, t.title);
  }
  if (p.title !== undefined) t.title = p.title;
  if (p.description !== undefined) t.description = p.description;
  if (p.priority !== undefined) t.priority = p.priority;
  if (p.dueDate !== undefined) t.dueDate = p.dueDate;
  return t;
}

// ---- Clients ----------------------------------------------------------------

export function upsertClient(ws: Workspace, session: Session, raw: unknown, id?: string): Client {
  requireRole(session, "clerk");
  const input = clientInputSchema.parse(raw);
  const now = nowISO();
  if (id) {
    const c = owned.client(ws, id);
    Object.assign(c, input, { updatedAt: now });
    audit(ws, session, "client.updated", "client", c.id, null, c.name);
    return c;
  }
  const c: Client = { id: newId("cli"), ...input, isDemo: false, createdAt: now, updatedAt: now };
  ws.clients.push(c);
  audit(ws, session, "client.created", "client", c.id, null, c.name);
  return c;
}

export function linkClient(ws: Workspace, session: Session, caseId: string, clientId: string | null) {
  requireRole(session, "clerk");
  const c = owned.case(ws, caseId);
  if (clientId) owned.client(ws, clientId);
  c.clientId = clientId;
  audit(ws, session, "case.client_linked", "case", c.id, c.id, clientId ?? "none");
}

// ---- Client updates -----------------------------------------------------------

export function editClientUpdate(ws: Workspace, session: Session, id: string, patch: { text?: string; status?: ClientUpdate["status"] }) {
  requireRole(session, "clerk");
  const u = owned.clientUpdate(ws, id);
  if (patch.text !== undefined) {
    if (patch.text.length > 2000) throw new ValidationError("Message is too long");
    u.text = patch.text;
  }
  if (patch.status) {
    u.status = patch.status;
    if (patch.status === "handed_off") u.handedOffAt = nowISO();
  }
  u.updatedAt = nowISO();
  audit(ws, session, `client_update.${patch.status ?? "edited"}`, "client_update", u.id, u.caseId, u.lang);
  return u;
}
