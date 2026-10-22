import "server-only";
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

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function getConnector(): ResearchConnector | null {
  if (config.researchConnector === "none") return null;
  if (config.researchConnector === "indiankanoon") return indianKanoonConnector;
  return demoConnector;
}
