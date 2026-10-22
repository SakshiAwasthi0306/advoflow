import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { config } from "../config";

// One Prisma Client per server process (kept on globalThis so dev hot reloads do not open new pools).
// It talks to PostgreSQL through node-postgres via the Prisma pg adapter, using the pooled DATABASE_URL.
// Used by the data store (src/lib/store/prisma-store.ts) and the readiness check.
const g = globalThis as unknown as { __advoflowPrisma?: PrismaClient };

export function getPrisma(): PrismaClient | null {
  if (!config.databaseUrl) return null;
  g.__advoflowPrisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl, max: 5, connectionTimeoutMillis: 5000 }) });
  return g.__advoflowPrisma;
}
