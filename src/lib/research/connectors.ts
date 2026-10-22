import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { config } from "../config";
import { DEMO_CORPUS } from "./demo-corpus";

export interface RetrievedDoc {
  sourceId: string;
  connector: string;
  title: string;
  citation: string | null;
  court: string;
  decisionDate: string | null;
  bench: string | null;
  url: string | null;
  passages: { id: string; text: string; locator: string | null }[];
  fictional: boolean;
  matchedTerms?: string[]; // search terms found in the record (keyword sources only)
}

/** Common interface every legal source implements. Retrieved text is DATA, never instructions. */
export interface ResearchConnector {
  id: string;
  label: string;
  live: boolean; // true only for a real, configured external source
  fictional: boolean; // true for the demo corpus
  available(): Promise<{ ok: boolean; reason?: string }>;
  search(query: string, limit: number): Promise<RetrievedDoc[]>;
  get(sourceId: string): Promise<RetrievedDoc | null>;
}

/** Small corpus of FICTIONAL judgments for demonstrations. None of these cases exist. */
export const demoConnector: ResearchConnector = {
  id: "demo",
  label: "Demo corpus (fictional authorities)",
  live: false,
  fictional: true,
  async available() {
    return { ok: true };
  },
  async search(query, limit) {
    const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    return DEMO_CORPUS.map((d) => ({ d, score: words.filter((w) => d.keywords.some((k) => k.includes(w))).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.d.doc);
  },
  async get(id) {
    return DEMO_CORPUS.find((d) => d.doc.sourceId === id)?.doc ?? null;
  },
};

/**
 * Indian Kanoon API connector (EXPERIMENTAL — written against the public API documentation,
 * not exercised end-to-end in this prototype). Requires a paid API token. Metadata and passages
 * come from the API response; nothing is filled in by the model.
 */
export const indianKanoonConnector: ResearchConnector = {
  id: "indiankanoon",
  label: "Indian Kanoon API (experimental)",
  live: true,
  fictional: false,
  async available() {
    return config.indianKanoonToken ? { ok: true } : { ok: false, reason: "INDIAN_KANOON_API_TOKEN is not set" };
  },
  async search(query, limit) {
    const res = await fetch(`https://api.indiankanoon.org/search/?formInput=${encodeURIComponent(query)}&pagenum=0`, {
      method: "POST",
      headers: { Authorization: `Token ${config.indianKanoonToken}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Indian Kanoon search failed (${res.status})`);
    const body = (await res.json()) as { docs?: { tid: number; title: string; headline?: string; docsource?: string; publishdate?: string }[] };
    return (body.docs ?? []).slice(0, limit).map((d) => ({
      sourceId: `ik:${d.tid}`,
      connector: "indiankanoon",
      title: stripTags(d.title),
      citation: null,
      court: d.docsource ?? "Unknown court",
      decisionDate: d.publishdate && /^\d{4}-\d{2}-\d{2}$/.test(d.publishdate) ? d.publishdate : null,
      bench: null,
      url: `https://indiankanoon.org/doc/${d.tid}/`,
      passages: d.headline ? [{ id: "h1", text: stripTags(d.headline), locator: null }] : [],
      fictional: false,
    }));
  },
  async get() {
    return null; // Full-document fetch not implemented in the prototype.
  },
};

export { OPEN_DATA_ATTRIBUTION } from "./attribution";

export interface JudgmentRow {
  id: string; source: "sc" | "khc"; court: string; bench: string | null; title: string; citation: string | null; neutral_citation: string | null;
  decision_date: string | null; text: string; text_kind: "headnotes" | "opening_lines"; pdf_url: string | null; matched: string[];
}

/** Split stored text into short, labelled passages. Text is quoted as stored; nothing is paraphrased. */
/**
 * Older SCR volumes (roughly pre-2023) have no "Issue for Consideration" block; their first page starts with margin
 * letters ("A B C D …"), a running head and the title/bench line before the headnote. Drop that header.
 */
export function cleanOldScr(text: string): string {
  if (text.startsWith("Issue for Consideration")) return text;
  const t = text.replace(/(?:\b[A-H]\b\s+){3,}/g, " ").replace(/\s+/g, " ").trim();
  const bench = t.slice(0, 900).match(/\[[^\]]{3,300}?\b(?:JJ|J|CJI)\s*\.?\s*[\])]/);
  return bench && bench.index !== undefined ? t.slice(bench.index + bench[0].length).trim() : t;
}

export function judgmentPassages(text: string, kind: JudgmentRow["text_kind"]): RetrievedDoc["passages"] {
  const cut = (t: string, n = 900) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, "")} …` : t);
  if (kind === "opening_lines") return [{ id: "p1", text: cut(text, 600), locator: "Opening lines of the judgment (eCourts metadata)" }];
  if (!text.startsWith("Issue for Consideration") && !text.startsWith("Headnote")) {
    const body = cleanOldScr(text);
    return body ? [{ id: "p1", text: cut(body), locator: "Headnote (SCR), first part" }] : [];
  }
  const h = text.indexOf("Headnotes");
  const issue = (h > 0 ? text.slice(0, h) : text).replace(/^Issue for Consideration\s*/, "").trim();
  const head = h >= 0 ? text.slice(h).replace(/^Headnotes\s*/, "").trim() : "";
  const out: RetrievedDoc["passages"] = [];
  if (issue) out.push({ id: "p1", text: cut(issue), locator: h >= 0 || text.startsWith("Issue") ? "Issue for Consideration (SCR)" : "Opening of the reported judgment (SCR)" });
  if (head) out.push({ id: "p2", text: cut(head), locator: "Headnotes (SCR), first part" });
  return out;
}

export function rowToDoc(r: JudgmentRow): RetrievedDoc {
  const date = r.decision_date ? String(r.decision_date).slice(0, 10) : null;
  return {
    sourceId: r.id, connector: "ecourts-opendata", title: r.title,
    citation: [r.citation, r.neutral_citation].filter(Boolean).join("; ") || null,
    court: r.court, decisionDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, bench: r.bench, url: r.pdf_url,
    passages: judgmentPassages(r.text, r.text_kind), fictional: false, matchedTerms: r.matched,
  };
}

const SELECT = "j.id, j.source, j.court, j.bench, j.title, j.citation, j.neutral_citation, j.decision_date::text AS decision_date, j.text, j.text_kind, j.pdf_url";

/**
 * Real judgments from the public eCourts open datasets, loaded into Postgres by scripts/judgments/load_judgments.py.
 * Keyword (full-text) search only: a hit means the words appear, not that the judgment decides the point.
 */
export function createOpenDataConnector(databaseUrl: () => string): ResearchConnector {
  let pool: Pool | null = null;
  const db = () => {
    if (!pool) {
      pool = new Pool({ connectionString: databaseUrl(), max: 2 });
      attachDatabasePool(pool);
    }
    return pool;
  };
  return {
    id: "ecourts-opendata",
    label: "eCourts open data: Supreme Court + Karnataka High Court (keyword search)",
    live: true,
    fictional: false,
    async available() {
      if (!databaseUrl()) return { ok: false, reason: "The eCourts open-data source needs DATABASE_URL (PostgreSQL)." };
      try {
        const r = await db().query("SELECT EXISTS (SELECT 1 FROM legal_judgments) AS any");
        return r.rows[0]?.any ? { ok: true } : { ok: false, reason: "No judgments are loaded yet (run scripts/judgments/load_judgments.py)." };
      } catch {
        return { ok: false, reason: "The judgments table is missing (run npm run db:migrate, then the loader)." };
      }
    },
    async search(query, limit) {
      // OR over the query's lexemes, then keep records that contain at least two of them (or all, for one-word queries).
      const r = await db().query<JudgmentRow>(
        `WITH q AS (SELECT array(SELECT DISTINCT lexeme FROM unnest(to_tsvector('english', $1))) AS lx),
              t AS (SELECT lx, (SELECT string_agg(quote_literal(l), ' | ') FROM unnest(lx) l)::tsquery AS tq FROM q WHERE cardinality(lx) > 0),
              hits AS (
                SELECT ${SELECT}, ts_rank_cd(j.search, t.tq) AS rank,
                       array(SELECT l FROM unnest(t.lx) l WHERE j.search @@ quote_literal(l)::tsquery) AS matched, cardinality(t.lx) AS total
                FROM legal_judgments j, t WHERE j.search @@ t.tq
                ORDER BY rank DESC LIMIT 80)
         SELECT * FROM hits WHERE cardinality(matched) >= LEAST(2, total)
         ORDER BY cardinality(matched) DESC, rank DESC LIMIT $2`,
        [query.slice(0, 300), Math.min(Math.max(limit, 1), 20)],
      );
      return r.rows.map(rowToDoc);
    },
    async get(id) {
      const r = await db().query<JudgmentRow>(`SELECT ${SELECT}, ARRAY[]::text[] AS matched FROM legal_judgments j WHERE j.id = $1`, [id]);
      return r.rows[0] ? rowToDoc(r.rows[0]) : null;
    },
  };
}

export const openDataConnector = createOpenDataConnector(() => config.databaseUrl);

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function getConnector(): ResearchConnector | null {
  if (config.researchConnector === "none") return null;
  if (config.researchConnector === "indiankanoon") return indianKanoonConnector;
  if (config.researchConnector === "opendata") return openDataConnector;
  return demoConnector;
}
