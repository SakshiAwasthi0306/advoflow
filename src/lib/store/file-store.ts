import { promises as fs } from "node:fs";
import path from "node:path";
import type { Workspace } from "../types";
import { ConflictError, type Membership, type UserRecord, type WorkspaceStore } from "./types";

/**
 * Local JSON file store for demo and development use.
 * NOT a secure production database: data sits unencrypted on this machine's disk.
 * Writes are atomic (temp file + rename) and version-checked; a per-office lock
 * serialises writes inside this process.
 */
export class FileStore implements WorkspaceStore {
  readonly kind = "file" as const;
  private locks = new Map<string, Promise<unknown>>();
  constructor(private dir: string) {}

  private officeFile(officeId: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(officeId)) throw new Error("Invalid office id");
    return path.join(this.dir, "offices", `${officeId}.json`);
  }
  private dirFile() {
    return path.join(this.dir, "directory.json");
  }
  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as T;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  private async writeJson(file: string, data: unknown) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    await fs.rename(tmp, file);
  }
  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(key, next.catch(() => undefined));
    return next;
  }

  async load(officeId: string) {
    return this.readJson<Workspace>(this.officeFile(officeId));
  }
  async save(ws: Workspace, expectedVersion: number) {
    await this.withLock(ws.office.id, async () => {
      const cur = await this.load(ws.office.id);
      if (cur && cur.version !== expectedVersion) throw new ConflictError();
      await this.writeJson(this.officeFile(ws.office.id), { ...ws, version: expectedVersion + 1 });
      ws.version = expectedVersion + 1;
    });
  }
  async createOffice(ws: Workspace) {
    await this.withLock(ws.office.id, async () => {
      if (await this.load(ws.office.id)) return;
      await this.writeJson(this.officeFile(ws.office.id), ws);
    });
  }

  private async directory() {
    return (await this.readJson<{ users: UserRecord[]; memberships: Membership[] }>(this.dirFile())) ?? { users: [], memberships: [] };
  }
  async findUserByEmail(email: string) {
    return (await this.directory()).users.find((u) => u.email === email.toLowerCase()) ?? null;
  }
  async getUser(id: string) {
    return (await this.directory()).users.find((u) => u.id === id) ?? null;
  }
  async createUser(user: UserRecord) {
    await this.withLock("__dir", async () => {
      const d = await this.directory();
      if (d.users.some((u) => u.email === user.email)) throw new Error("A user with that email already exists");
      d.users.push(user);
      await this.writeJson(this.dirFile(), d);
    });
  }
  async addMembership(m: Membership) {
    await this.withLock("__dir", async () => {
      const d = await this.directory();
      if (!d.memberships.some((x) => x.userId === m.userId && x.officeId === m.officeId)) d.memberships.push(m);
      await this.writeJson(this.dirFile(), d);
    });
  }
  async membershipsFor(userId: string) {
    return (await this.directory()).memberships.filter((m) => m.userId === userId);
  }
}
