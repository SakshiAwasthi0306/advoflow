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
import { createOpenDataConnector } from "@/lib/research/connectors";

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

  it("searches loaded open-data judgments by keyword and needs at least two matching terms", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    const ins = "INSERT INTO legal_judgments (id, source, court, bench, title, citation, neutral_citation, decision_date, disposal, text, text_kind, pdf_url, dataset) VALUES ($1,$2,$3,null,$4,$5,null,$6,null,$7,$8,null,'test')";
    await c.query(ins, ["sc:t1", "sc", "Supreme Court of India", "A v. B", "[2020] 1 S.C.R. 1", "2020-01-01", "Issue for Consideration Whether the written statement can be taken on record after delay. Headnotes Code of Civil Procedure – Order VIII Rule 1 – costs.", "headnotes"]);
    await c.query(ins, ["sc:t2", "sc", "Supreme Court of India", "C v. D", "[2021] 2 S.C.R. 2", "2021-01-01", "Issue for Consideration Murder conviction based on circumstantial evidence. Headnotes Penal Code – s. 302.", "headnotes"]);
    await c.query(ins, ["khc:t3", "khc", "High Court of Karnataka", "WP/1/2024 of E v. F", null, "2024-01-01", "WP No. 1 of 2024 statement of objections", "opening_lines"]);
    await c.end();
    const od = createOpenDataConnector(() => url!);
    expect(await od.available()).toEqual({ ok: true });
    const r = await od.search("written statement delay costs", 5);
    expect(r.map((d) => d.sourceId)).toEqual(["sc:t1"]); // t3 matches only "statement"
    expect(r[0].matchedTerms?.length).toBeGreaterThanOrEqual(2);
    expect(r[0].passages[0].locator).toBe("Issue for Consideration (SCR)");
    expect((await od.get("sc:t2"))?.citation).toBe("[2021] 2 S.C.R. 2");
    expect(await od.search("", 5)).toEqual([]);
  });
});
