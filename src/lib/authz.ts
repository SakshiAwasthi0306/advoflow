import type { CaseRecord, Client, ClientUpdate, CourtOrder, DocumentRecord, Hearing, ProcessingJob, ResearchReport, Role, Session, Task, Workspace } from "./types";
import { NotFoundError, PermissionError } from "./services/workspace";

// Server-side authorization, used by every service and API route.
//
// 1. WHO: the session (src/lib/session.ts) is the only source of userId, officeId and role.
// 2. WHICH OFFICE: services only ever receive the Workspace of session.officeId (loaded by officeId from the session,
//    never from the request), so another office's records are not even in memory.
// 3. WHICH RECORD: every lookup by id goes through `owned` below. It searches only that Workspace and, for records that
//    belong to a case (hearings, orders, tasks, documents, client messages, research), also requires the parent case to
//    be in the same office. Missing and "belongs to someone else" give the SAME 404, so ids cannot be probed.
// 4. WHAT: `can`/`authorize` map roles to actions. The database adds a last line of defence: composite (officeId, id)
//    foreign keys make cross-office links impossible (prisma/schema.prisma).

export type Action =
  | "read"            // see the office's records
  | "edit"            // cases, clients, tasks, uploads, client messages
  | "approve"         // approve/reject orders, confirm hearings, review research, import old data
  | "manage_office";  // demo data, export, members

const MIN_ROLE: Record<Action, Role> = { read: "viewer", edit: "clerk", approve: "advocate", manage_office: "owner" };
const RANK: Record<Role, number> = { viewer: 0, clerk: 1, advocate: 2, owner: 3 };

export const can = (session: Session, action: Action) => RANK[session.role] >= RANK[MIN_ROLE[action]];

export function authorize(session: Session, action: Action) {
  if (!can(session, action)) throw new PermissionError(`Your role (${session.role}) cannot do this.`);
}

const NOT_FOUND = (what: string) => new NotFoundError(`${what} not found`);

function inOffice<T extends { id: string }>(list: T[], id: unknown, what: string): T {
  const rec = typeof id === "string" ? list.find((x) => x.id === id) : undefined;
  if (!rec) throw NOT_FOUND(what);
  return rec;
}

/** A child record is only accessible when its parent case is in the same office. */
function withCase<T extends { id: string; caseId: string | null }>(ws: Workspace, list: T[], id: unknown, what: string, allowNoCase = false): T {
  const rec = inOffice(list, id, what);
  if (rec.caseId === null ? !allowNoCase : !ws.cases.some((c) => c.id === rec.caseId)) throw NOT_FOUND(what);
  return rec;
}

/** Look up a record of the current office by id, or throw a 404 that does not reveal whether it exists elsewhere. */
export const owned = {
  case: (ws: Workspace, id: unknown): CaseRecord => inOffice(ws.cases, id, "Case"),
  client: (ws: Workspace, id: unknown): Client => inOffice(ws.clients, id, "Client"),
  hearing: (ws: Workspace, id: unknown): Hearing => withCase(ws, ws.hearings, id, "Hearing"),
  order: (ws: Workspace, id: unknown): CourtOrder => withCase(ws, ws.orders, id, "Order"),
  task: (ws: Workspace, id: unknown): Task => withCase(ws, ws.tasks, id, "Task"),
  clientUpdate: (ws: Workspace, id: unknown): ClientUpdate => withCase(ws, ws.clientUpdates, id, "Client message"),
  report: (ws: Workspace, id: unknown): ResearchReport => withCase(ws, ws.research, id, "Research report"),
  /** Documents may be unattached (uploaded, not yet matched to a case); they still belong to the office. */
  document: (ws: Workspace, id: unknown): DocumentRecord => withCase(ws, ws.documents, id, "Document", true),
  job: (ws: Workspace, id: unknown): ProcessingJob => {
    const job = inOffice(ws.jobs, id, "Review item");
    owned.document(ws, job.documentId);
    return job;
  },
};
