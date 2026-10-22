import { createHash } from "node:crypto";
import { getPrisma } from "./db/prisma";
import { RateLimitError } from "./http";

// Fixed-window rate limits. With PostgreSQL the counters live in app."RateLimit", so every server instance
// shares them (an attacker cannot spread attempts across serverless instances). Without a database (local
// demo) an in-process counter is used. Keys never contain raw emails or IP addresses, only short hashes.

export const limitKey = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);

const memory = new Map<string, { count: number; resetAt: number }>();

export async function hitLimit(scope: string, subject: string, max: number, windowSeconds: number): Promise<void> {
  const key = `${scope}:${limitKey(scope, subject)}`;
  const prisma = getPrisma();
  let count: number;
  let resetAt: number;
  if (prisma) {
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "app"."RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
      ON CONFLICT ("key") DO UPDATE SET
        "count"   = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimit"."resetAt" END
      RETURNING "count", "resetAt"`;
    count = Number(rows[0].count);
    resetAt = rows[0].resetAt.getTime();
  } else {
    const now = Date.now();
    const cur = memory.get(key);
    const next = !cur || cur.resetAt <= now ? { count: 1, resetAt: now + windowSeconds * 1000 } : { count: cur.count + 1, resetAt: cur.resetAt };
    memory.set(key, next);
    ({ count, resetAt } = next);
  }
  if (count > max) throw new RateLimitError("Too many attempts. Please wait and try again.", Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
}

/** Client address as seen by the platform proxy (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
