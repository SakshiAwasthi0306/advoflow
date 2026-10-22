import type { Role, Workspace } from "../types";

export class ConflictError extends Error {
  constructor() {
    super("The workspace was changed by someone else. Reload and try again.");
  }
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export interface Membership {
  userId: string;
  officeId: string;
  role: Role;
}

/**
 * Persistence boundary. A store only ever reads or writes ONE office's data per call,
 * which is how office-level isolation is enforced: callers pass the officeId from the
 * verified session, never from the request body.
 */
export interface WorkspaceStore {
  readonly kind: "file" | "postgres";
  load(officeId: string): Promise<Workspace | null>;
  /** Saves the whole aggregate atomically. Throws ConflictError if `expectedVersion` is stale. */
  save(ws: Workspace, expectedVersion: number): Promise<void>;
  createOffice(ws: Workspace): Promise<void>;
  // Directory (users and memberships), used by password login.
  findUserByEmail(email: string): Promise<UserRecord | null>;
  getUser(id: string): Promise<UserRecord | null>;
  createUser(user: UserRecord): Promise<void>;
  addMembership(m: Membership): Promise<void>;
  membershipsFor(userId: string): Promise<Membership[]>;
}
