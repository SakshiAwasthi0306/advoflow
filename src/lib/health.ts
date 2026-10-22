import type { EnvIssue } from "./env";

// Health checks, kept free of framework code so they can be unit-tested.
//   liveness  (GET /api/health):       is the app process up and is its configuration valid? Never touches the database.
//   readiness (GET /api/health/ready): can it serve requests now? Checks the database round trip as well.
// Responses carry status words, variable NAMES and timings only — never values, hosts, credentials or stack traces.

export interface AppInfo {
  service: "advoflow";
  version: string;
  commit: string | null;
}

export function liveness(info: AppInfo, issues: EnvIssue[], now = new Date()) {
  return {
    status: issues.length ? ("degraded" as const) : ("ok" as const),
    ...info,
    time: now.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks: { config: issues.length ? { status: "error" as const, issues } : { status: "ok" as const } },
  };
}

export type DatabaseCheck =
  | { status: "up"; latencyMs: number }
  | { status: "down"; latencyMs: number; error: "timeout" | "connection_failed" }
  | { status: "not_configured"; note: string };

/** Run `ping` (e.g. SELECT 1) with a timeout. The caller logs the underlying error; the result only says what kind of failure. */
export async function checkDatabase(ping: (() => Promise<unknown>) | null, opts: { timeoutMs?: number; required: boolean; onError?: (e: unknown) => void }): Promise<DatabaseCheck> {
  if (!ping) {
    return { status: "not_configured", note: opts.required ? "DATABASE_URL is required here but not set" : "DATABASE_URL not set: demo file store in use" };
  }
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ping(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new TimeoutError()), opts.timeoutMs ?? 3000); }),
    ]);
    return { status: "up", latencyMs: Date.now() - started };
  } catch (e) {
    opts.onError?.(e);
    return { status: "down", latencyMs: Date.now() - started, error: e instanceof TimeoutError ? "timeout" : "connection_failed" };
  } finally {
    clearTimeout(timer);
  }
}

class TimeoutError extends Error {}

export function readiness(info: AppInfo, issues: EnvIssue[], database: DatabaseCheck, databaseRequired: boolean, now = new Date()) {
  const dbOk = database.status === "up" || (database.status === "not_configured" && !databaseRequired);
  const ready = dbOk && issues.length === 0;
  return {
    httpStatus: ready ? 200 : 503,
    body: {
      status: ready ? ("ready" as const) : ("not_ready" as const),
      ...info,
      time: now.toISOString(),
      checks: { config: issues.length ? { status: "error" as const, issues } : { status: "ok" as const }, database },
    },
  };
}
