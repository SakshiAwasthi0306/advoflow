// PrismaStore against real PostgreSQL. Runs only when PG_TEST_URL points at a THROWAWAY database
// (the Prisma migrations are applied to it), e.g. PG_TEST_URL=postgres://postgres:postgres@localhost:5432/advoflow_test npm test
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { PrismaStore } from "@/lib/store/prisma-store";
import { mutate } from "@/lib/services/workspace";
import { createCase, createTask, updateTask } from "@/lib/services/cases";
import { clearDemo, seedDemo } from "@/lib/demo/seed";
import { researchAction } from "@/lib/services/research";
import { ConflictError } from "@/lib/store/types";
import { createOpenDataConnector } from "@/lib/research/connectors";
import type { Session, Workspace } from "@/lib/types";

const url = process.env.PG_TEST_URL;
const run = Math.random().toString(36).slice(2, 8);
const A: Session = { userId: `u_a_${run}`, officeId: `pg_a_${run}`, role: "owner", name: "A", mode: "password" };
const B: Session = { userId: `u_b_${run}`, officeId: `pg_b_${run}`, role: "owner", name: "B", mode: "password" };

/** Order-independent view of a workspace: every list sorted by id, the version counter left out. */
function canonical(ws: Workspace) {
  const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return {
    office: ws.office, demoLoaded: ws.demoLoaded,
    clients: sortById(ws.clients), cases: sortById(ws.cases), documents: sortById(ws.documents), jobs: sortById(ws.jobs),
    orders: sortById(ws.orders), hearings: sortById(ws.hearings), dateChanges: sortById(ws.dateChanges), tasks: sortById(ws.tasks),
    clientUpdates: sortById(ws.clientUpdates), audit: sortById(ws.audit),
    research: sortById(ws.research).map((r) => ({ ...r, versions: [...r.versions].sort((a, b) => a.version - b.version) })),
  };
}

describe.skipIf(!url)("PrismaStore (PostgreSQL)", () => {
  let store: PrismaStore;
  beforeAll(async () => {
    store = new PrismaStore(url!);
  }, 120_000);
  afterAll(async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.query(`DELETE FROM app."Office" WHERE id = ANY($1)`, [[A.officeId, B.officeId]]);
    await c.query(`DELETE FROM app."User" WHERE id = ANY($1)`, [[A.userId, B.userId, `user_${run}`]]);
    await c.end();
    await store?.close();
  });

  it("stores the full demo workspace in the normalised tables and reads back exactly the same data", async () => {
    let written: Workspace | null = null;
    await mutate(store, A, async (w) => {
      w.members.push({ userId: A.userId, name: "A", email: "", role: "owner" });
      await seedDemo(w, A, async (sha) => `${A.officeId}/${sha}.txt`);
      written = structuredClone(w);
    });
    const back = (await store.load(A.officeId))!;
    expect(canonical(back)).toEqual(canonical(written!));
    expect(back.members.map((m) => m.userId)).toContain(A.userId);

    const c = new Client({ connectionString: url });
    await c.connect();
    const q = async (sql: string) => Number((await c.query(sql, [A.officeId])).rows[0].n);
    expect(await q(`SELECT count(*) n FROM app."Case" WHERE "officeId"=$1`)).toBe(back.cases.length);
    expect(await q(`SELECT count(*) n FROM app."CaseParty" WHERE "officeId"=$1 AND side='PETITIONER'`)).toBe(back.cases.length);
    expect(await q(`SELECT count(*) n FROM app."Hearing" WHERE "officeId"=$1 AND status='SUPERSEDED'`)).toBeGreaterThan(0);
    expect(await q(`SELECT count(*) n FROM app."ResearchAuthority" WHERE "officeId"=$1 AND "isFictional"`)).toBeGreaterThan(0);
    expect(await q(`SELECT count(*) n FROM app."CaseClient" WHERE "officeId"=$1 AND "isPrimary"`)).toBe(back.cases.filter((x) => x.clientId).length);
    await c.end();
  }, 60_000);

  it("saves later changes, including research review state, and keeps them across loads", async () => {
    const w = await mutate(store, A, (w) => {
      const t = createTask(w, A, { caseId: w.cases[0].id, title: "Prepare list of dates", dueDate: "2026-11-02", priority: "high" });
      updateTask(w, A, t.id, { status: "done" });
      const rep = w.research[0];
      const a = rep.versions[0].authorities[0];
      researchAction(w, A, rep.id, 1, { type: "review_authority", authorityId: a.id });
      researchAction(w, A, rep.id, 1, { type: "save_authority", authorityId: a.id });
      researchAction(w, A, rep.id, 1, { type: "mark_reviewed" });
      return w;
    });
    const back = (await store.load(A.officeId))!;
    expect(canonical(back)).toEqual(canonical(w));
    const v = back.research[0].versions[0];
    expect(v.status).toBe("reviewed");
    expect(v.reviewedAuthorityIds).toHaveLength(1);
    expect(v.savedAuthorityIds).toHaveLength(1);
    expect(back.tasks.find((t) => t.title === "Prepare list of dates")?.status).toBe("done");
  }, 60_000);

  it("keeps offices isolated", async () => {
    const wb = await mutate(store, B, (w) => w);
    expect(wb.cases).toHaveLength(0);
    expect(JSON.stringify(wb)).not.toContain("Ramesh");
  });

  it("rejects a stale save and rolls the whole save back", async () => {
    const w1 = (await store.load(A.officeId))!;
    const w2 = (await store.load(A.officeId))!;
    createCase(w1, A, { number: "O.S. 900/2026" });
    await store.save(w1, w1.version);
    createCase(w2, A, { number: "O.S. 901/2026" });
    await expect(store.save(w2, w2.version)).rejects.toBeInstanceOf(ConflictError);
    const fresh = (await store.load(A.officeId))!;
    expect(fresh.cases.some((c) => c.number === "O.S. 900/2026")).toBe(true);
    expect(fresh.cases.some((c) => c.number === "O.S. 901/2026")).toBe(false);
  });

  it("concurrent changes through mutate() are both kept", async () => {
    await Promise.all([
      mutate(store, A, (w) => createCase(w, A, { number: "O.S. 910/2026" })),
      mutate(store, A, (w) => createCase(w, A, { number: "O.S. 911/2026" })),
    ]);
    const w = (await store.load(A.officeId))!;
    expect(w.cases.filter((c) => c.number === "O.S. 910/2026" || c.number === "O.S. 911/2026")).toHaveLength(2);
  }, 60_000);

  it("the database blocks a second live case with the same number, and nothing from that save is kept", async () => {
    const w = (await store.load(A.officeId))!;
    const before = w.version;
    w.cases.push({ ...w.cases[0], id: `case_dupe_${run}` });
    w.clients.push({ ...w.clients[0], id: `client_extra_${run}`, name: "Should not persist" });
    await expect(store.save(w, w.version)).rejects.toThrow(/case_office_number_live_uniq|Unique constraint/);
    const fresh = (await store.load(A.officeId))!;
    expect(fresh.version).toBe(before);
    expect(fresh.clients.some((c) => c.id === `client_extra_${run}`)).toBe(false);
  });

  it("switches a case's primary client, and detaches a document while deleting its case, in single saves", async () => {
    const w = (await store.load(A.officeId))!;
    const c = w.cases.find((x) => x.clientId)!;
    const other = w.clients.find((x) => x.id !== c.clientId)!;
    c.clientId = other.id; // old link removed + new primary link created in one save
    await store.save(w, w.version);
    expect((await store.load(A.officeId))!.cases.find((x) => x.id === c.id)!.clientId).toBe(other.id);

    const w2 = (await store.load(A.officeId))!;
    const victim = createCase(w2, A, { number: `O.S. 950/2026` });
    w2.documents.push({ id: `doc_own_${run}`, caseId: victim.id, filename: "own.txt", mime: "text/plain", size: 3, sha256: "e".repeat(64), storageKey: "k", kind: "order", textExtract: "own", textSource: "pasted", isDemo: false, uploadedBy: A.userId, createdAt: new Date().toISOString() });
    await store.save(w2, w2.version);
    const w3 = (await store.load(A.officeId))!;
    w3.cases = w3.cases.filter((x) => x.id !== victim.id);
    w3.documents.find((d) => d.id === `doc_own_${run}`)!.caseId = null;
    await store.save(w3, w3.version);
    const back = (await store.load(A.officeId))!;
    expect(back.cases.some((x) => x.id === victim.id)).toBe(false);
    expect(back.documents.find((d) => d.id === `doc_own_${run}`)?.caseId).toBeNull();
  });

  it("removing the demo deletes its rows and leaves the advocate's own records and the audit trail", async () => {
    await mutate(store, A, (w) => clearDemo(w, A));
    const w = (await store.load(A.officeId))!;
    expect(w.cases.every((c) => !c.isDemo)).toBe(true);
    expect(w.cases.some((c) => c.number === "O.S. 900/2026")).toBe(true);
    expect(w.orders).toHaveLength(0);
    expect(w.research).toHaveLength(0);
    expect(w.audit.some((a) => a.action === "demo.loaded")).toBe(true);
    const c = new Client({ connectionString: url });
    await c.connect();
    const n = await c.query(`SELECT count(*)::int n FROM app."ResearchAuthority" WHERE "officeId"=$1`, [A.officeId]);
    expect(n.rows[0].n).toBe(0);
    await c.end();
  });

  it("stores users and memberships for password sign-in", async () => {
    const id = `user_${run}`;
    await store.createUser({ id, email: `Asha.${run}@Example.com`, name: "Asha", passwordHash: "scrypt$x", createdAt: new Date().toISOString() });
    await store.addMembership({ userId: id, officeId: A.officeId, role: "advocate" });
    await store.addMembership({ userId: id, officeId: A.officeId, role: "advocate" }); // idempotent
    expect((await store.findUserByEmail(`asha.${run}@example.com`))?.id).toBe(id);
    expect(await store.membershipsFor(id)).toEqual([{ userId: id, officeId: A.officeId, role: "advocate" }]);
    // Placeholder members (no password) can never sign in.
    expect(await store.findUserByEmail(`${A.userId}@placeholder.invalid`)).toBeNull();
  });

  it("searches loaded open-data judgments by keyword and needs at least two matching terms", async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.query("DELETE FROM public.legal_judgments WHERE dataset = 'test'");
    const ins = "INSERT INTO public.legal_judgments (id, source, court, bench, title, citation, neutral_citation, decision_date, disposal, text, text_kind, pdf_url, dataset) VALUES ($1,$2,$3,null,$4,$5,null,$6,null,$7,$8,null,'test')";
    await c.query(ins, ["sc:t1", "sc", "Supreme Court of India", "A v. B", "[2020] 1 S.C.R. 1", "2020-01-01", "Issue for Consideration Whether the zqxwritten zqxstatement can be taken on record after zqxdelay. Headnotes Code of Civil Procedure – Order VIII Rule 1 – zqxcosts.", "headnotes"]);
    await c.query(ins, ["sc:t2", "sc", "Supreme Court of India", "C v. D", "[2021] 2 S.C.R. 2", "2021-01-01", "Issue for Consideration Murder conviction based on circumstantial evidence. Headnotes Penal Code – s. 302.", "headnotes"]);
    await c.query(ins, ["khc:t3", "khc", "High Court of Karnataka", "WP/1/2024 of E v. F", null, "2024-01-01", "WP No. 1 of 2024 zqxstatement of objections", "opening_lines"]);
    const od = createOpenDataConnector(() => url!);
    expect(await od.available()).toEqual({ ok: true });
    const r = await od.search("zqxwritten zqxstatement zqxdelay zqxcosts", 5); // made-up words: works on a database that also holds real judgments
    expect(r.map((d) => d.sourceId)).toEqual(["sc:t1"]); // khc:t3 matches only one term
    expect((await od.get("sc:t2"))?.citation).toBe("[2021] 2 S.C.R. 2");
    await c.query("DELETE FROM public.legal_judgments WHERE dataset = 'test'");
    await c.end();
  });
});
