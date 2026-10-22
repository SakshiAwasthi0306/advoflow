import path from "node:path";
import { config } from "../config";
import { getPrisma } from "../db/prisma";
import { FileStore } from "./file-store";
import { PrismaStore } from "./prisma-store";
import type { WorkspaceStore } from "./types";

let store: WorkspaceStore | null = null;

/** PostgreSQL through Prisma when DATABASE_URL is set; otherwise the local demo file store in .data/. */
export function getStore(): WorkspaceStore {
  if (!store) {
    const prisma = getPrisma();
    store = prisma ? new PrismaStore(prisma) : new FileStore(path.resolve(config.dataDir));
  }
  return store;
}
