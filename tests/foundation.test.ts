import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseEnv } from "@/lib/env";
import { createLogger, redact } from "@/lib/logger";
import { errorResponse, RateLimitError, UnauthenticatedError } from "@/lib/http";
import { NotFoundError, PermissionError, ValidationError } from "@/lib/services/workspace";
import { ConflictError } from "@/lib/store/types";
import { checkDatabase, liveness, readiness, type AppInfo } from "@/lib/health";

const info: AppInfo = { service: "advoflow", version: "0.1.0", commit: null };
const PG = "postgresql://user:s3cret-pass@db.example.internal:5432/app?sslmode=require";

describe("environment validation", () => {
  it("runs with no configuration at all (demo mode, no AI key needed)", () => {
    const e = parseEnv({});
    expect(e.issues).toEqual([]);
    expect(e.authMode).toBe("demo");
    expect(e.anthropicKey).toBe("");
    expect(e.researchConnector).toBe("demo");
  });

  it("treats empty values as unset, like a copied .env.example", () => {
    const e = parseEnv({ AUTH_MODE: "", AUTH_SECRET: "", DATABASE_URL: "", APP_URL: "", ANTHROPIC_API_KEY: "" });
    expect(e.issues).toEqual([]);
    expect(e.databaseUrl).toBe("");
  });

  it("reports invalid values by variable name, never by value", () => {
    const e = parseEnv({ DATABASE_URL: "mysql://root:hunter2@host/db", APP_URL: "not a url", RESEARCH_CONNECTOR: "westlaw" });
    expect(e.issues.map((i) => i.variable).sort()).toEqual(["APP_URL", "DATABASE_URL", "RESEARCH_CONNECTOR"]);
    expect(JSON.stringify(e.issues)).not.toMatch(/hunter2|mysql:\/\/|not a url|westlaw/);
    expect(e.databaseUrl).toBe(""); // the invalid URL is not used
  });

  it("keeps valid variables when another one is invalid", () => {
    const e = parseEnv({ DATABASE_URL: PG, APP_URL: "nope" });
    expect(e.databaseUrl).toBe(PG);
    expect(e.issues.map((i) => i.variable)).toEqual(["APP_URL"]);
  });

  it("fails closed: an unknown AUTH_MODE requires sign-in", () => {
    const e = parseEnv({ AUTH_MODE: "pasword", AUTH_SECRET: "x".repeat(40), DATABASE_URL: PG });
    expect(e.authMode).toBe("password");
    expect(e.issues.map((i) => i.variable)).toEqual(["AUTH_MODE"]);
  });

  it("checks settings that depend on each other", () => {
    expect(parseEnv({ AUTH_MODE: "password", AUTH_SECRET: "short", DATABASE_URL: PG }).issues.map((i) => i.variable)).toEqual(["AUTH_SECRET"]);
    expect(parseEnv({ AUTH_MODE: "password", AUTH_SECRET: "y".repeat(48) }).issues.map((i) => i.variable)).toEqual(["DATABASE_URL"]); // accounts live in PostgreSQL
    expect(parseEnv({ VERCEL: "1" }).issues.map((i) => i.variable)).toEqual(["DATABASE_URL"]);
    expect(parseEnv({ RESEARCH_CONNECTOR: "opendata" }).issues.map((i) => i.variable)).toEqual(["RESEARCH_CONNECTOR"]);
    expect(parseEnv({ RESEARCH_CONNECTOR: "indiankanoon" }).issues.map((i) => i.variable)).toEqual(["INDIAN_KANOON_API_TOKEN"]);
    expect(parseEnv({ VERCEL: "1", DATABASE_URL: PG, RESEARCH_CONNECTOR: "opendata", AUTH_MODE: "password", AUTH_SECRET: "y".repeat(48) }).issues).toEqual([]);
  });
});

describe("structured logging", () => {
  it("writes one JSON object per line with level, time and message", () => {
    const lines: string[] = [];
    const log = createLogger({ level: "info", write: (l) => lines.push(l), base: { service: "advoflow" } });
    log.debug("hidden");
    log.info("hello", { requestId: "r1" });
    expect(lines).toHaveLength(1);
    const o = JSON.parse(lines[0]);
    expect(o).toMatchObject({ level: "info", msg: "hello", service: "advoflow", requestId: "r1" });
    expect(new Date(o.time).toString()).not.toBe("Invalid Date");
  });

  it("masks secrets by field name and connection strings inside text", () => {
    const out = JSON.stringify(redact({ password: "p", apiKey: "k", authorization: "Bearer x", DATABASE_URL: PG, note: `failed to reach ${PG}`, nested: { token: "t", ok: 1 } }));
    expect(out).not.toMatch(/s3cret|Bearer x|"p"|"k"|"t"|db\.example\.internal/);
    expect(out).toContain("postgresql://[redacted]");
    expect(out).toContain('"ok":1');
  });

  it("logs errors as name and message only, without the stack", () => {
    const lines: string[] = [];
    createLogger({ write: (l) => lines.push(l) }).error("boom", { error: new Error(`connect ECONNREFUSED ${PG}`) });
    expect(lines[0]).not.toMatch(/at .*\.ts|s3cret/);
    expect(JSON.parse(lines[0]).error.name).toBe("Error");
  });
});

describe("API error format", () => {
  const cases: [unknown, number, string][] = [
    [z.object({ a: z.string() }).safeParse({}).error, 400, "VALIDATION_ERROR"],
    [new ValidationError("bad"), 400, "VALIDATION_ERROR"],
    [new UnauthenticatedError("Please sign in."), 401, "UNAUTHENTICATED"],
    [new PermissionError("no"), 403, "FORBIDDEN"],
    [new NotFoundError("missing"), 404, "NOT_FOUND"],
    [new ConflictError(), 409, "CONFLICT"],
    [new RateLimitError("slow down"), 429, "RATE_LIMITED"],
  ];
  it.each(cases)("maps known errors to status and code (%#)", async (e, status, code) => {
    const r = errorResponse(e, "req-1");
    expect(r.status).toBe(status);
    expect(r.headers.get("x-request-id")).toBe("req-1");
    expect(await r.json()).toMatchObject({ code, requestId: "req-1", error: expect.any(String) });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const r = errorResponse(new Error(`relation "secret_table" does not exist at ${PG}`), "req-2");
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(body).toEqual({ error: "Something went wrong. Nothing was changed; please try again.", code: "INTERNAL_ERROR", requestId: "req-2" });
  });
});

describe("health checks", () => {
  it("liveness reports ok without touching the database, and degraded on config problems", () => {
    expect(liveness(info, [])).toMatchObject({ status: "ok", service: "advoflow", checks: { config: { status: "ok" } } });
    const d = liveness(info, [{ variable: "AUTH_SECRET", message: "is required" }]);
    expect(d.status).toBe("degraded");
    expect(d.checks.config).toEqual({ status: "error", issues: [{ variable: "AUTH_SECRET", message: "is required" }] });
  });

  it("readiness is 200 when the database answers", async () => {
    const db = await checkDatabase(async () => 1, { required: true });
    expect(db.status).toBe("up");
    const r = readiness(info, [], db, true);
    expect(r.httpStatus).toBe(200);
    expect(r.body.status).toBe("ready");
  });

  it("readiness is 503 with a generic reason when the database fails, and the caller gets the real error to log", async () => {
    let logged: unknown;
    const db = await checkDatabase(async () => { throw new Error(`password authentication failed for ${PG}`); }, { required: true, onError: (e) => { logged = e; } });
    expect(db).toMatchObject({ status: "down", error: "connection_failed" });
    expect((logged as Error).message).toMatch(/password authentication failed/);
    const r = readiness(info, [], db, true);
    expect(r.httpStatus).toBe(503);
    expect(JSON.stringify(r.body)).not.toMatch(/password|s3cret|example\.internal/);
  });

  it("times out a hanging database", async () => {
    const db = await checkDatabase(() => new Promise(() => undefined), { required: true, timeoutMs: 20 });
    expect(db).toMatchObject({ status: "down", error: "timeout" });
  });

  it("without DATABASE_URL: ready in local demo mode, not ready where a database is required", async () => {
    const local = await checkDatabase(null, { required: false });
    expect(readiness(info, [], local, false).httpStatus).toBe(200);
    const hosted = await checkDatabase(null, { required: true });
    expect(hosted.status).toBe("not_configured");
    expect(readiness(info, [], hosted, true).httpStatus).toBe(503);
  });

  it("config problems make the app not ready", async () => {
    const db = await checkDatabase(async () => 1, { required: true });
    expect(readiness(info, [{ variable: "AUTH_SECRET", message: "x" }], db, true).httpStatus).toBe(503);
  });
});
