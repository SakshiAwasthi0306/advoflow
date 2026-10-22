import { promises as fs } from "node:fs";
import path from "node:path";
import type { Workspace } from "../types";
import { ConflictError, type WorkspaceStore } from "./types";

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
}
