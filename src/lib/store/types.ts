import type { Workspace } from "../types";

export class ConflictError extends Error {
  constructor() {
    super("The workspace was changed by someone else. Reload and try again.");
  }
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
  // Users, credentials and sessions are not part of the store: they are managed by Better Auth (src/lib/auth/).
}
