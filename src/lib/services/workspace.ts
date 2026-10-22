import type { AuditEntry, Role, Session, Workspace } from "../types";
import { ConflictError, type WorkspaceStore } from "../store/types";
import { newId, nowISO } from "../util";

export class PermissionError extends Error {
  status = 403;
}
export class NotFoundError extends Error {
  status = 404;
}
export class ValidationError extends Error {
  status = 400;
}

const RANK: Record<Role, number> = { viewer: 0, clerk: 1, advocate: 2, owner: 3 };

/** Server-side permission check. Every mutation calls this with the session from the signed cookie. */
export function requireRole(session: Session, min: Role) {
  if (RANK[session.role] < RANK[min]) throw new PermissionError(`This action needs the ${min} role.`);
}

export function emptyWorkspace(officeId: string, name: string, members: Workspace["members"]): Workspace {
  return {
    office: { id: officeId, name, createdAt: nowISO() },
    version: 0,
    members,
    clients: [], cases: [], documents: [], jobs: [], orders: [], hearings: [], dateChanges: [],
    tasks: [], clientUpdates: [], research: [], audit: [],
    demoLoaded: false,
  };
}

export async function loadWorkspace(store: WorkspaceStore, session: Session): Promise<Workspace> {
  let ws = await store.load(session.officeId);
  if (!ws) {
    await store.createOffice(emptyWorkspace(session.officeId, session.mode === "demo" ? "Demo Chambers" : "My Office", [
      { userId: session.userId, name: session.name, email: "", role: session.role },
    ]));
    ws = await store.load(session.officeId);
  }
  if (!ws) throw new Error("Could not create workspace");
  return ws;
}

export function audit(ws: Workspace, session: Session, action: string, entity: string, entityId: string, caseId: string | null, detail = "") {
  const e: AuditEntry = { id: newId("aud"), at: nowISO(), userId: session.userId, action, entity, entityId, caseId, detail };
  ws.audit.push(e);
}

/**
 * Load → mutate → save as one unit. If another request saved first, the whole
 * mutation is re-run on fresh data (up to 3 times), so related changes never half-apply.
 */
export async function mutate<T>(store: WorkspaceStore, session: Session, fn: (ws: Workspace) => T | Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ws = await loadWorkspace(store, session);
    const expected = ws.version;
    const result = await fn(ws);
    try {
      await store.save(ws, expected);
      return result;
    } catch (e) {
      if (e instanceof ConflictError && attempt < 2) continue;
      throw e;
    }
  }
  throw new ConflictError();
}
