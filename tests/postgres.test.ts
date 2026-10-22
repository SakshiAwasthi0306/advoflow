// Runs only when PG_TEST_URL points at an EMPTY throwaway database, e.g.
// PG_TEST_URL=postgres://postgres@localhost:5432/advoflow_test npm test
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { PostgresStore } from "@/lib/store/postgres-store";
import { mutate } from "@/lib/services/workspace";
import { createCase } from "@/lib/services/cases";
import { seedDemo } from "@/lib/demo/seed";
import { ConflictError } from "@/lib/store/types";
import type { Session } from "@/lib/types";
import { migrate } from "../scripts/migrate";

const url = process.env.PG_TEST_URL;
const A: Session = { userId: "u1", officeId: "pg_office_a", role: "owner", name: "A", mode: "password" };
const B: Session = { userId: "u2", officeId: "pg_office_b", role: "owner", name: "B", mode: "password" };

describe.skipIf(!url)("PostgresStore", () => {
  let store: PostgresStore;
  beforeAll(async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await c.end();
    await migrate(url!);
    store = new PostgresStore(url!);
  });
  afterAll(async () => store?.close());

  it("round-trips the full demo workspace in relational tables", async () => {
    await mutate(store, A, (w) => seedDemo(w, A, async (sha) => `pg_office_a/${sha}.txt`));
    const w = (await store.load(A.officeId))!;
    expect(w.cases.length).toBeGreaterThanOrEqual(3);
    expect(w.research[0].versions).toHaveLength(1);
    const c = new Client({ connectionString: url });
    await c.connect();
    const r = await c.query("SELECT count(*)::int n FROM judicial_authorities WHERE office_id=$1 AND fictional", [A.officeId]);
    expect(r.rows[0].n).toBeGreaterThan(0);
    const t = await c.query("SELECT count(*)::int n FROM tasks WHERE office_id=$1", [A.officeId]);
    expect(t.rows[0].n).toBe(w.tasks.length);
    await c.end();
  });

  it("keeps offices isolated", async () => {
    const wb = await mutate(store, B, (w) => w);
    expect(wb.cases).toHaveLength(0);
    expect(JSON.stringify(wb)).not.toContain("Ramesh");
  });

  it("rejects stale writes and rolls back the whole save", async () => {
    const w1 = (await store.load(A.officeId))!;
    const w2 = (await store.load(A.officeId))!;
    createCase(w1, A, { number: "O.S. 900/2026" });
    await store.save(w1, w1.version);
    createCase(w2, A, { number: "O.S. 901/2026" });
    await expect(store.save(w2, w2.version)).rejects.toBeInstanceOf(ConflictError);
    const fresh = (await store.load(A.officeId))!;
    expect(fresh.cases.some((c) => c.number === "O.S. 901/2026")).toBe(false);
  });

  it("enforces one live case per number at the database level", async () => {
    const w = (await store.load(A.officeId))!;
    const dup = { ...w.cases[0], id: "case_dupe_test" };
    w.cases.push(dup);
    await expect(store.save(w, w.version)).rejects.toThrow(/cases_office_number_uniq/);
  });
});
