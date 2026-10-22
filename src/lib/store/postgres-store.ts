import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolClient } from "pg";
import type { ResearchReport, Workspace } from "../types";
import { ConflictError, type Membership, type UserRecord, type WorkspaceStore } from "./types";

type Row = Record<string, unknown>;
interface Collection {
  key: keyof Workspace;
  table: string;
  columns: (r: Row) => Row; // typed columns besides id, office_id, data
}

// Parents before children. Deletes run in reverse.
const COLLECTIONS: Collection[] = [
  { key: "clients", table: "clients", columns: (r) => ({ name: r.name }) },
  { key: "cases", table: "cases", columns: (r) => ({ number_key: r.numberKey ?? null, status: r.status, client_id: r.clientId ?? null }) },
  { key: "documents", table: "documents", columns: (r) => ({ case_id: r.caseId ?? null, sha256: r.sha256 }) },
  { key: "jobs", table: "processing_jobs", columns: (r) => ({ document_id: r.documentId, idempotency_key: r.idempotencyKey, status: r.status }) },
  { key: "orders", table: "court_orders", columns: (r) => ({ case_id: r.caseId, document_id: r.documentId, order_date: r.orderDate ?? null }) },
  { key: "hearings", table: "hearings", columns: (r) => ({ case_id: r.caseId, hearing_date: r.date, status: r.status }) },
  { key: "dateChanges", table: "date_changes", columns: (r) => ({ case_id: r.caseId }) },
  { key: "tasks", table: "tasks", columns: (r) => ({ case_id: r.caseId, due_date: r.dueDate ?? null, status: r.status, dedupe_key: r.dedupeKey ?? null }) },
  { key: "clientUpdates", table: "client_updates", columns: (r) => ({ case_id: r.caseId }) },
  { key: "research", table: "research_reports", columns: (r) => ({ case_id: r.caseId }) },
];

/**
 * PostgreSQL store. The office aggregate is written in ONE transaction:
 * the office row's version is checked and bumped (optimistic locking), removed rows
 * are deleted, and every record is upserted. Audit rows are insert-only.
 */
export class PostgresStore implements WorkspaceStore {
  readonly kind = "postgres" as const;
  private pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 5 });
    // On Vercel (Fluid compute) this keeps the function alive just long enough to release idle connections.
    attachDatabasePool(this.pool);
  }
  async close() {
    await this.pool.end();
  }

  async load(officeId: string): Promise<Workspace | null> {
    const c = await this.pool.connect();
    try {
      const o = await c.query("SELECT * FROM offices WHERE id=$1", [officeId]);
      if (!o.rowCount) return null;
      const off = o.rows[0];
      const ws: Workspace = {
        office: { id: off.id, name: off.name, createdAt: new Date(off.created_at).toISOString() },
        version: off.version,
        members: off.members ?? [],
        demoLoaded: off.demo_loaded,
        clients: [], cases: [], documents: [], jobs: [], orders: [], hearings: [], dateChanges: [],
        tasks: [], clientUpdates: [], research: [], audit: [],
      };
      for (const col of COLLECTIONS) {
        const r = await c.query(`SELECT data FROM ${col.table} WHERE office_id=$1`, [officeId]);
        (ws[col.key] as unknown[]) = r.rows.map((x) => x.data);
      }
      const v = await c.query("SELECT report_id, data FROM research_report_versions WHERE office_id=$1 ORDER BY version", [officeId]);
      for (const rep of ws.research) rep.versions = v.rows.filter((x) => x.report_id === rep.id).map((x) => x.data);
      const a = await c.query("SELECT data FROM audit_logs WHERE office_id=$1 ORDER BY at", [officeId]);
      ws.audit = a.rows.map((x) => x.data);
      return ws;
    } finally {
      c.release();
    }
  }

  async createOffice(ws: Workspace) {
    await this.pool.query(
      "INSERT INTO offices(id,name,version,demo_loaded,members,created_at) VALUES($1,$2,0,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
      [ws.office.id, ws.office.name, ws.demoLoaded, JSON.stringify(ws.members), ws.office.createdAt],
    );
  }

  async save(ws: Workspace, expectedVersion: number) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const upd = await c.query(
        "UPDATE offices SET version=version+1, name=$3, demo_loaded=$4, members=$5 WHERE id=$1 AND version=$2",
        [ws.office.id, expectedVersion, ws.office.name, ws.demoLoaded, JSON.stringify(ws.members)],
      );
      if (upd.rowCount !== 1) throw new ConflictError();
      const office = ws.office.id;
      // 1) delete rows that no longer exist, children first
      for (const col of [...COLLECTIONS].reverse()) {
        const ids = (ws[col.key] as unknown as Row[]).map((r) => r.id as string);
        await c.query(`DELETE FROM ${col.table} WHERE office_id=$1 AND NOT (id = ANY($2::text[]))`, [office, ids]);
      }
      // 2) upsert, parents first
      for (const col of COLLECTIONS) {
        for (const rec of ws[col.key] as unknown as Row[]) await upsert(c, col, office, rec);
      }
      // 3) research versions and their projections
      for (const rep of ws.research) await saveVersions(c, office, rep);
      // 4) audit: insert-only
      for (const a of ws.audit) {
        await c.query(
          "INSERT INTO audit_logs(id,office_id,case_id,at,action,data) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING",
          [a.id, office, a.caseId, a.at, a.action, JSON.stringify(a)],
        );
      }
      await c.query("COMMIT");
      ws.version = expectedVersion + 1;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }

  async findUserByEmail(email: string) {
    const r = await this.pool.query("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
    return r.rowCount ? toUser(r.rows[0]) : null;
  }
  async getUser(id: string) {
    const r = await this.pool.query("SELECT * FROM users WHERE id=$1", [id]);
    return r.rowCount ? toUser(r.rows[0]) : null;
  }
  async createUser(u: UserRecord) {
    await this.pool.query("INSERT INTO users(id,email,name,password_hash,created_at) VALUES($1,$2,$3,$4,$5)", [u.id, u.email, u.name, u.passwordHash, u.createdAt]);
  }
  async addMembership(m: Membership) {
    await this.pool.query("INSERT INTO office_memberships(office_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [m.officeId, m.userId, m.role]);
  }
  async membershipsFor(userId: string) {
    const r = await this.pool.query("SELECT * FROM office_memberships WHERE user_id=$1", [userId]);
    return r.rows.map((x) => ({ userId: x.user_id, officeId: x.office_id, role: x.role }));
  }
}

function toUser(r: Row): UserRecord {
  return { id: r.id as string, email: r.email as string, name: r.name as string, passwordHash: r.password_hash as string, createdAt: new Date(r.created_at as string).toISOString() };
}

async function upsert(c: PoolClient, col: Collection, office: string, rec: Row) {
  const data = col.key === "research" ? { ...rec, versions: [] } : rec;
  const extra = col.columns(rec);
  const names = ["id", "office_id", ...Object.keys(extra), "data", "updated_at"];
  const values = [rec.id, office, ...Object.values(extra), JSON.stringify(data), new Date().toISOString()];
  const ph = names.map((_, i) => `$${i + 1}`).join(",");
  const set = names.filter((n) => n !== "id" && n !== "office_id").map((n) => `${n}=EXCLUDED.${n}`).join(",");
  // The WHERE guard stops a record id that belongs to another office from being taken over.
  await c.query(`INSERT INTO ${col.table}(${names.join(",")}) VALUES(${ph}) ON CONFLICT (id) DO UPDATE SET ${set} WHERE ${col.table}.office_id=EXCLUDED.office_id`, values);
}

async function saveVersions(c: PoolClient, office: string, rep: ResearchReport) {
  for (const v of rep.versions) {
    await c.query(
      `INSERT INTO research_report_versions(report_id,office_id,version,mode,data,updated_at) VALUES($1,$2,$3,$4,$5,now())
       ON CONFLICT (report_id,version) DO UPDATE SET data=EXCLUDED.data, updated_at=now() WHERE research_report_versions.office_id=EXCLUDED.office_id`,
      [rep.id, office, v.version, v.mode, JSON.stringify(v)],
    );
    for (const t of ["legal_issues", "statutory_provisions", "judicial_authorities", "source_passages", "saved_authorities", "research_notes"]) {
      await c.query(`DELETE FROM ${t} WHERE report_id=$1 AND version=$2 AND office_id=$3`, [rep.id, v.version, office]);
    }
    for (const i of v.issues) await c.query("INSERT INTO legal_issues VALUES($1,$2,$3,$4,$5)", [rep.id, v.version, i.id, office, JSON.stringify(i)]);
    for (const p of v.provisions)
      await c.query("INSERT INTO statutory_provisions VALUES($1,$2,$3,$4,$5,$6)", [rep.id, v.version, p.id, office, p.verification, JSON.stringify(p)]);
    for (const a of v.authorities) {
      await c.query("INSERT INTO judicial_authorities VALUES($1,$2,$3,$4,$5,$6,$7)", [rep.id, v.version, a.id, office, a.verification, a.fictional, JSON.stringify(a)]);
      for (const p of a.passages) await c.query("INSERT INTO source_passages VALUES($1,$2,$3,$4,$5,$6)", [rep.id, v.version, a.id, p.id, office, JSON.stringify(p)]);
    }
    for (const id of v.savedAuthorityIds) await c.query("INSERT INTO saved_authorities VALUES($1,$2,$3,$4)", [rep.id, v.version, id, office]);
    for (const n of v.notes) await c.query("INSERT INTO research_notes VALUES($1,$2,$3,$4,$5,$6)", [rep.id, v.version, n.id, office, n.author, JSON.stringify(n)]);
  }
}
