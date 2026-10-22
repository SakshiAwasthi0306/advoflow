import path from "node:path";
import { config } from "../config";
import { FileStore } from "./file-store";
import { PostgresStore } from "./postgres-store";
import type { WorkspaceStore } from "./types";

let store: WorkspaceStore | null = null;

export function getStore(): WorkspaceStore {
  if (!store) {
    store = config.databaseUrl ? new PostgresStore(config.databaseUrl) : new FileStore(path.resolve(config.dataDir));
  }
  return store;
}
