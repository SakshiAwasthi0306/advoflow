import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, ExternalLink, Scale } from "lucide-react";
import { pageData } from "@/lib/server";
import { formatDate } from "@/lib/dates";
import { currentHearing } from "@/lib/services/orders";
import type { Authority } from "@/lib/types";
import { OPEN_DATA_ATTRIBUTION } from "@/lib/research/attribution";
import { AIBadge, Badge, Card, DemoBadge, Notice, PageHeader } from "@/components/ui";
import { VerificationBadge } from "@/components/status";
import { ActionButton, CopyButton } from "@/components/client";
import { NoteForm, PrintButton, StepToTask } from "@/components/research-widgets";
import { ResearchStart } from "@/components/widgets";

export const metadata = { title: "Research report" };

const STANCE: Record<Authority["stance"], { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  unclassified: { label: "Not analysed", tone: "neutral" },
  supports: { label: "Supports", tone: "ok" },
  limits: { label: "Limits", tone: "warn" },
  contradicts: { label: "Contradicts", tone: "danger" },
};

export default async function Report({ params, searchParams }: { params: { id: string }; searchParams: { v?: string } }) {
  const { ws } = await pageData();
  const report = ws.research.find((r) => r.id === params.id);
  if (!report) notFound();
  const c = ws.cases.find((x) => x.id === report.caseId)!;
  const v = report.versions.find((x) => x.version === Number(searchParams.v)) ?? report.versions.at(-1)!;
  const url = `/api/research/${report.id}/${v.version}`;
  const orders = ws.orders.filter((o) => v.orderIds.includes(o.id));
  const docs = ws.documents.filter((d) => v.documentIds.includes(d.id));
  const authById = new Map(v.authorities.map((a) => [a.id, a]));
  const provById = new Map(v.provisions.map((p) => [p.id, p]));
  const refName = (id: string) => authById.get(id)?.name ?? (provById.get(id) ? `${provById.get(id)!.legislation}, ${provById.get(id)!.section}` : null);
  const hearing = currentHearing(ws, c.id);
  const contrary = v.authorities.filter((a) => a.stance === "limits" || a.stance === "contradicts");
  const openData = v.authorities.some((a) => a.connector === "ecourts-opendata");
  const allOrders = ws.orders.filter((o) => o.caseId === c.id);
  const newerOrders = allOrders.filter((o) => !v.orderIds.includes(o.id) && o.approvedAt > v.createdAt);
  const section = (n: number, t: string) => <span className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-navy-50 text-xs font-semibold text-navy-800">{n}</span>{t}</span>;

  return (
    <>
      <PageHeader
        eyebrow={<Link className="link" href={`/cases/${c.id}?tab=research`}>{c.number}{c.title ? ` · ${c.title}` : ""}</Link>}
        title={report.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={v.status === "reviewed" ? "ok" : "warn"}>{v.status === "reviewed" ? "Reviewed by advocate" : "Needs your review"}</Badge>
          {v.mode === "demo" ? <Badge tone="demo">Demo — fictional sources</Badge> : v.mode === "rules" ? <Badge tone="navy">Real judgments · keyword match, not analysed</Badge> : v.mode === "partial" ? <AIBadge>AI research draft · no judgments found</AIBadge> : <AIBadge>AI research draft · judgments from the database</AIBadge>}
          <span>Generated {new Date(v.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}{v.pipeline.includes(":") ? ` · ${v.pipeline.split(":")[1]?.split("/")[0]}` : v.mode === "rules" ? " · fixed rules, no AI" : ""}</span>
        </span>}
        actions={<>
          {v.status !== "reviewed" && <ActionButton url={url} body={{ type: "mark_reviewed" }} className="btn-primary" success="Marked as reviewed">Mark report reviewed</ActionButton>}
          <PrintButton />
        </>}
      />

      {report.versions.length > 1 && (
        <nav aria-label="Versions" className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Versions:</span>
          {report.versions.map((x) => <Link key={x.version} href={`/research/${report.id}?v=${x.version}`} aria-current={x.version === v.version ? "page" : undefined} className={x.version === v.version ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>v{x.version} · {new Date(x.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</Link>)}
          <span className="text-xs text-muted">Earlier versions are kept unchanged.</span>
        </nav>
      )}

      <div className="mb-4 space-y-2">
        {v.mode === "demo" && <Notice tone="demo" title="Demonstration report">Every judgment below is FICTIONAL and exists only to show how AdvoFlow presents research. Do not cite any of them. Live legal research is not connected.</Notice>}
        {newerOrders.length > 0 && <Notice tone="warn" title="Newer orders exist">{newerOrders.length} order(s) were approved after this report was generated and are not reflected in it. Rerun research to include them.</Notice>}
        <Notice tone="neutral">Research suggestions, not legal advice or a prediction of the outcome. Verify each source before relying on it.</Notice>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={section(1, "Research summary")}>
            {v.question && <p className="mb-2 text-sm"><span className="font-medium">Question: </span>{v.question}</p>}
            <p className="text-sm">{v.summary}</p>
            <p className="mt-2 text-xs text-muted">Based on: {orders.length ? orders.map((o) => `order of ${formatDate(o.orderDate)}`).join(", ") : "no orders"}{docs.length ? `; ${docs.map((d) => d.filename).join(", ")}` : ""}. Case stage: {c.stage || "not recorded"}.</p>
          </Card>

          <Card title={section(2, "Identified legal issues")}>
            <div className="space-y-4">
              {v.issues.map((i) => (
                <div key={i.id} className="text-sm">
                  <h3 className="font-semibold">{i.title}</h3>
                  <p className="mt-1"><span className="font-medium">What the order decided: </span>{i.whatOrderDecided}</p>
                  {i.questionsNext.length > 0 && <div className="mt-2"><div className="font-medium">Questions to answer before the next date</div><ul className="ml-5 list-disc">{i.questionsNext.map((q, j) => <li key={j}>{q}</li>)}</ul></div>}
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-ok-line bg-ok-soft/50 p-2"><div className="text-xs font-semibold text-ok">Facts from approved orders</div><ul className="ml-4 list-disc text-[13px]">{i.establishedFacts.length ? i.establishedFacts.map((f, j) => <li key={j}>{f}</li>) : <li>None recorded</li>}</ul></div>
                    <div className="rounded-lg border border-dashed border-ai-line bg-ai-soft/60 p-2"><div className="text-xs font-semibold text-ai">Inferences (not established)</div><ul className="ml-4 list-disc text-[13px]">{i.inferences.length ? i.inferences.map((f, j) => <li key={j}>{f}</li>) : <li>None</li>}</ul></div>
                  </div>
                  {i.unknownFacts.length > 0 && <div className="mt-2 rounded-lg border border-line bg-surface p-2"><div className="text-xs font-semibold text-muted">Facts to find out (they could change the answer)</div><ul className="ml-4 list-disc text-[13px]">{i.unknownFacts.map((f, j) => <li key={j}>{f}</li>)}</ul></div>}
                </div>
              ))}
            </div>
          </Card>

          <Card title={section(3, "Potentially applicable provisions")}>
            {v.provisions.length ? (
              <ul className="space-y-3">
                {v.provisions.map((p) => (
                  <li key={p.id} className="rounded-lg border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{p.legislation} — {p.section}</span><VerificationBadge v={p.verification} />{p.origin === "ai_suggested" && <AIBadge>AI-suggested · check the text</AIBadge>}</div>
                    <p className="mt-1">{p.explanation}</p>
                    <p className="mt-1 text-muted"><span className="font-medium text-ink">Why it may matter: </span>{p.relevance}</p>
                    {p.factsRequired.length > 0 && <p className="mt-1 text-muted"><span className="font-medium text-ink">Facts needed: </span>{p.factsRequired.join("; ")}</p>}
                    {p.considerations && <p className="mt-1 text-muted"><span className="font-medium text-ink">Check before relying: </span>{p.considerations}</p>}
                    <div className="no-print mt-2 flex flex-wrap gap-2">
                      {p.url ? <a className="btn-secondary btn-sm" href={p.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Official text</a> : <a className="btn-secondary btn-sm" href="https://www.indiacode.nic.in/" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Check on India Code</a>}
                      <ActionButton url={url} body={{ type: "bookmark_provision", provisionId: p.id }} className="btn-ghost btn-sm">{v.bookmarkedProvisionIds.includes(p.id) ? <><Bookmark className="h-3.5 w-3.5 fill-current" aria-hidden /> Bookmarked</> : <><Bookmark className="h-3.5 w-3.5" aria-hidden /> Bookmark</>}</ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No provisions identified.</p>}
          </Card>

          <Card title={section(4, v.mode === "rules" ? "Judgments to read" : "Relevant judgments")}>
            {openData && <p className="mb-3 text-xs text-muted">Real judgments from {OPEN_DATA_ATTRIBUTION} {v.mode === "rules" ? "They were matched by keywords only; a match does not mean the judgment decides your point." : ""}</p>}
            {v.authorities.length ? (
              <ul className="space-y-3">
                {v.authorities.map((a) => {
                  const reviewed = v.reviewedAuthorityIds.includes(a.id);
                  return (
                    <li key={a.id} className={`rounded-lg border p-3 text-sm ${a.fictional ? "border-demo-line bg-demo-soft/30" : "border-line"}`}>
                      <div className="flex flex-wrap items-start gap-2">
                        <Scale className="mt-0.5 h-4 w-4 text-muted" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{a.name}</div>
                          <div className="text-xs text-muted">{[a.citation, a.court, a.decisionDate ? formatDate(a.decisionDate) : null, a.bench].filter(Boolean).join(" · ")}</div>
                        </div>
                        <Badge tone={STANCE[a.stance].tone}>{STANCE[a.stance].label}</Badge>
                        <Badge tone="neutral" icon={false}>{a.bindingness === "binding" ? "Likely binding" : a.bindingness === "persuasive" ? "Persuasive" : "Bindingness unclear"}</Badge>
                        <VerificationBadge v={a.verification} />
                      </div>
                      {a.issue && <p className="mt-2"><span className="font-medium">Issue: </span>{a.issue}</p>}
                      {a.principle && <p className="mt-1"><span className="font-medium">Principle: </span>{a.principle}</p>}
                      {a.passages.map((p) => <blockquote key={p.id} className="mt-2 border-l-2 border-navy-700/40 pl-3 text-[13px] text-ink/90">“{p.text}”{p.locator && <span className="ml-1 text-xs text-muted">— {p.locator}</span>}</blockquote>)}
                      {a.relevance && <p className="mt-2 text-muted"><span className="font-medium text-ink">{a.stance === "unclassified" ? "Why it is listed: " : "Why it may help: "}</span>{a.relevance}</p>}
                      {a.distinctions && <p className="mt-1 text-muted"><span className="font-medium text-ink">Distinctions: </span>{a.distinctions}</p>}
                      <p className="mt-1 text-xs text-muted">Subsequent treatment: {a.treatment ?? "not checked (no validity-checking source connected)"}</p>
                      <div className="no-print mt-2 flex flex-wrap gap-2">
                        {a.url ? <a className="btn-secondary btn-sm" href={a.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open source</a> : <span className="text-xs text-muted">{a.fictional ? "No source — fictional record" : "No link available"}</span>}
                        {a.citation && <CopyButton text={`${a.name.replace(" (FICTIONAL DEMO)", "")}, ${a.citation}`} label="Copy citation" />}
                        <ActionButton url={url} body={{ type: "save_authority", authorityId: a.id }} className="btn-ghost btn-sm">{v.savedAuthorityIds.includes(a.id) ? "Saved to case ✓" : "Save to case"}</ActionButton>
                        <ActionButton url={url} body={{ type: "review_authority", authorityId: a.id }} className="btn-ghost btn-sm">{reviewed ? "Reviewed ✓ (undo)" : "Mark as reviewed"}</ActionButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">No judgments were retrieved. {v.sourcesChecked.find((s) => s.error)?.error ?? ""}</p>}
          </Card>

          <Card title={section(5, "Potential supporting arguments")}>
            {v.arguments.length ? v.arguments.map((g) => (
              <div key={g.id} className="mb-3 rounded-lg border border-line p-3 text-sm last:mb-0">
                <p className="font-medium">{g.proposition}</p>
                {g.supportIds.length > 0 && <p className="mt-1 text-muted">Supported by: {g.supportIds.map(refName).filter(Boolean).join("; ")}</p>}
                {g.evidenceNeeded.length > 0 && <p className="mt-1 text-muted">Facts or evidence needed: {g.evidenceNeeded.join("; ")}</p>}
                {g.counterpoints.length > 0 && <p className="mt-1 text-muted">Possible answers to it: {g.counterpoints.join(" / ")}</p>}
                <p className="mt-1 text-xs text-muted">Limitations: {g.limitations} · Verify: {g.verify}</p>
              </div>
            )) : <p className="text-sm text-muted">No arguments proposed.</p>}
          </Card>

          <Card title={section(6, "Counterarguments & risks")}>
            {v.counterarguments.length || contrary.length ? (
              <ul className="space-y-2 text-sm">{v.counterarguments.map((x) => (
                <li key={x.id} className="rounded-lg border border-warn-line bg-warn-soft/40 p-3"><p>{x.point}</p>{x.authorityIds.length > 0 && <p className="mt-1 text-xs text-muted">Source: {x.authorityIds.map(refName).filter(Boolean).join("; ")}</p>}{x.risk && <p className="mt-1 text-xs text-warn">Risk: {x.risk}</p>}</li>
              ))}</ul>
            ) : <p className="text-sm text-muted">No contrary material was found in the retrieved sources. That does not mean none exists.</p>}
          </Card>

          <Card title={section(7, "Missing facts and evidence")}>
            {v.missingFacts.length ? <ul className="ml-5 list-disc text-sm">{v.missingFacts.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p className="text-sm text-muted">None listed.</p>}
          </Card>

          <Card title={section(8, "Suggested next steps")}>
            {v.nextSteps.length ? (
              <ul className="divide-y divide-line text-sm">{v.nextSteps.map((st) => (
                <li key={st.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <Badge tone="navy" icon={false}>{st.kind}</Badge>
                  <span className="min-w-0 flex-1">{st.text}</span>
                  {st.taskId ? <Link className="link text-xs" href={`/cases/${c.id}?tab=tasks`}>Task created ✓</Link> : <span className="no-print"><StepToTask url={url} stepId={st.id} text={st.text} nextHearing={hearing?.date ?? null} /></span>}
                </li>
              ))}</ul>
            ) : <p className="text-sm text-muted">None.</p>}
          </Card>

          <Card title={section(9, "Sources & verification")}>
            <ul className="space-y-1 text-sm">
              {v.sourcesChecked.map((s, i) => (
                <li key={i}><span className="font-medium">{s.connector === "demo" ? "Demo corpus (fictional)" : s.connector === "none" ? "No legal source" : s.connector}</span> · {s.resultCount} result(s) · checked {new Date(s.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{s.error && <span className="text-danger"> · {s.error}</span>}<div className="text-xs text-muted">Queries: {s.queries.join(" | ")}</div></li>
              ))}
            </ul>
            <div className="mt-3 text-sm"><div className="font-medium">Limitations</div><ul className="ml-5 list-disc text-muted">{v.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
            <p className="mt-2 text-xs text-muted">Reviewed by you: {v.reviewedAuthorityIds.length} of {v.authorities.length} judgments. Statutory and case-law updates after {formatDate(v.createdAt.slice(0, 10))} have not been checked.</p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Notes">
            <ul className="mb-3 space-y-2 text-sm">
              {v.notes.length ? v.notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-line p-2">
                  <div className="mb-1 flex items-center gap-2 text-xs">{n.author === "advocate" ? <Badge tone="navy" icon={false}>Your note</Badge> : <Badge tone="neutral" icon={false}>AI note</Badge>}<span className="text-muted">{new Date(n.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</span></div>
                  <p className="whitespace-pre-wrap">{n.text}</p>
                </li>
              )) : <li className="text-muted">No notes yet.</li>}
            </ul>
            <div className="no-print"><NoteForm url={url} /></div>
          </Card>
          <Card title="Saved to case">
            {v.savedAuthorityIds.length || v.bookmarkedProvisionIds.length ? (
              <ul className="space-y-1 text-sm">
                {v.savedAuthorityIds.map((id) => <li key={id}>{authById.get(id)?.name} {authById.get(id)?.fictional && <DemoBadge />}</li>)}
                {v.bookmarkedProvisionIds.map((id) => <li key={id}>{provById.get(id)?.legislation}, {provById.get(id)?.section}</li>)}
              </ul>
            ) : <p className="text-sm text-muted">Nothing saved yet.</p>}
          </Card>
          <Card title="Rerun research" className="no-print">
            <p className="mb-3 text-sm text-muted">Creates version {report.versions.length + 1}. This version stays as it is.</p>
            <ResearchStart caseId={c.id} reportId={report.id} defaultQuestion={v.question} orders={allOrders.sort((a, b) => (b.orderDate ?? "").localeCompare(a.orderDate ?? "")).map((o) => ({ id: o.id, label: `Order of ${formatDate(o.orderDate)}` }))} docs={[]} />
          </Card>
        </div>
      </div>
    </>
  );
}
