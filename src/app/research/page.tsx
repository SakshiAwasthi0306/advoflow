import Link from "next/link";
import { pageData } from "@/lib/server";
import { config } from "@/lib/config";
import { OPEN_DATA_ATTRIBUTION } from "@/lib/research/attribution";
import { Badge, Card, DemoBadge, EmptyState, Notice, PageHeader } from "@/components/ui";
import { CaseOrderPicker } from "@/components/research-widgets";

export const metadata = { title: "Legal Research" };

export default async function ResearchIndex() {
  const { ws } = await pageData();
  const reports = [...ws.research].sort((a, b) => (b.versions.at(-1)?.createdAt ?? "").localeCompare(a.versions.at(-1)?.createdAt ?? ""));
  const caseOf = (id: string) => ws.cases.find((c) => c.id === id);
  return (
    <>
      <PageHeader eyebrow="Orders & research" title="Legal research" subtitle="Start from a verified order. See the issues it raises, possibly applicable provisions, supporting and contrary authorities, and what to check next." />
      <div className="mb-4">
        {config.researchConnector === "indiankanoon" && config.indianKanoonToken
          ? <Notice tone="navy" title="Indian Kanoon connector is configured (experimental)">Judgments are retrieved from Indian Kanoon. Treat every result as unreviewed until you have read it.</Notice>
          : config.researchConnector === "opendata" && config.databaseUrl
          ? <Notice tone="navy" title="Real judgments: eCourts open data (keyword search)">Judgments come from {OPEN_DATA_ATTRIBUTION} {config.anthropicKey ? "Claude analyses the stored headnotes or opening lines only." : "Without an AI key they are matched by keywords only and not analysed, so read each one before relying on it."} New reports use this source; reports made earlier keep their original sources.</Notice>
          : <Notice tone="demo" title="Live legal research is not connected">Judgments come from a small corpus of FICTIONAL demo records so you can see how reports work. They are not real law and must never be cited. {config.anthropicKey ? "Issue analysis uses Claude." : "Issue analysis uses fixed demo rules (no AI key)."}</Notice>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {reports.length ? reports.map((r) => {
            const v = r.versions.at(-1)!;
            const c = caseOf(r.caseId);
            return (
              <Link key={r.id} href={`/research/${r.id}`} className="card block p-4 hover:border-navy-700/40">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c?.number}</span>{c?.isDemo && <DemoBadge />}<Badge tone={v.status === "reviewed" ? "ok" : "warn"}>{v.status === "reviewed" ? "Reviewed" : "Needs review"}</Badge>{v.mode === "demo" && <Badge tone="demo">Fictional sources</Badge>}{v.mode === "rules" && <Badge tone="navy">Real judgments</Badge>}<span className="text-xs text-muted">v{v.version} · {new Date(v.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span></div>
                <div className="mt-1 text-sm">{r.title}</div>
                <div className="mt-1 line-clamp-2 text-sm text-muted">{v.summary}</div>
              </Link>
            );
          }) : <EmptyState title="No research reports yet" body="Pick a case to analyse its latest approved order." />}
        </div>
        <Card title="Start research">
          <CaseOrderPicker cases={ws.cases.filter((c) => c.status === "active").map((c) => ({ id: c.id, number: c.number, title: c.title }))} />
        </Card>
      </div>
    </>
  );
}
