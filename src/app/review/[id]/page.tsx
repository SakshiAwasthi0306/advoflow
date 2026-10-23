import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { pageData } from "@/lib/server";
import { formatDate } from "@/lib/dates";
import { AIBadge, Badge, Card, DemoBadge, Notice, PageHeader } from "@/components/ui";
import { JobBadge } from "@/components/status";
import { ActionButton } from "@/components/client";
import { ReviewForm } from "@/components/review-form";
import { OrderReveal, type RevealFact } from "@/components/order-reveal";
import type { OrderDetails } from "@/lib/types";

export const metadata = { title: "Review order" };

export default async function Review({ params }: { params: { id: string } }) {
  const { ws } = await pageData();
  const job = ws.jobs.find((j) => j.id === params.id);
  if (!job) notFound();
  const doc = ws.documents.find((d) => d.id === job.documentId);
  const ex = job.extraction;
  const order = job.resultOrderId ? ws.orders.find((o) => o.id === job.resultOrderId) : null;
  const readOnly = job.status === "approved" || job.status === "rejected";
  const FACTS = [["caseNumber", "Case number"], ["title", "Parties"], ["court", "Court"], ["orderDate", "Order date"], ["nextHearingDate", "Next hearing"], ["stage", "Stage"], ["adjourned", "Adjourned"], ["costs", "Costs"], ["summary", "What happened"]] as const;
  const facts: RevealFact[] = ex ? FACTS.flatMap(([k, label]) => {
    const f = ex[k] as { value: unknown; source: string | null };
    if (!f?.source || f.value === null || f.value === undefined) return [];
    const value = typeof f.value === "boolean" ? (f.value ? "yes" : "no") : /^\d{4}-\d{2}-\d{2}$/.test(String(f.value)) ? formatDate(String(f.value)) : String(f.value).slice(0, 48);
    return [{ key: k, label, value, source: f.source }];
  }) : [];
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/upload" className="hover:text-ink">← Court orders</Link>}
        title={job.status === "failed" ? "Enter order details" : job.status === "needs_review" ? "Check the draft" : "Order review"}
        subtitle={<span className="flex flex-wrap items-center gap-2"><JobBadge status={job.status} />{doc?.filename}{doc?.isDemo && <DemoBadge />}{ex && <span className="text-muted">· {ex.extractor === "gemini" || ex.extractor === "openrouter" ? `AI draft by ${ex.model}${ex.extractor === "openrouter" ? " via OpenRouter" : ""}, not verified` : ex.extractor === "anthropic" ? `Read by Claude (${ex.model})` : ex.extractor === "case-diary-import" ? "Imported from the Case Diary prototype" : "Read by the rule-based demo extractor"} · confidence {ex.confidence}</span>}</span>}
        actions={job.status === "rejected" ? <ActionButton url={`/api/jobs/${job.id}`} body={{ action: "reopen" }} success="Reopened for review">Reopen</ActionButton> : order ? <Link className="btn-primary" href={`/cases/${order.caseId}?tab=orders`}>Open case</Link> : null}
      />
      <div className="mb-4 space-y-2">
        {job.status === "failed" && <Notice tone="danger" title="This document could not be read automatically">{job.error} The original is saved. Fill in the details below by hand, or upload a clearer copy to try again.</Notice>}
        {job.status === "approved" && <Notice tone="ok" title={`Approved ${job.decidedAt ? formatDate(job.decidedAt.slice(0, 10)) : ""}`}>This order is in the case timeline. Approving again would not create duplicates.</Notice>}
        {job.status === "rejected" && <Notice tone="neutral" title="Rejected">No records were changed. The document is kept; reopen to review it again.</Notice>}
        {job.conflicts.map((c, i) => <Notice key={i} tone="warn">{c}</Notice>)}
        {ex && ex.warnings.length > 0 && (
          <div className={ex.extractor === "gemini" || ex.extractor === "openrouter" ? "ai-draft px-4 py-3" : "rounded-[10px] border border-warn-line bg-warn-soft/50 px-4 py-3"}>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">{ex.extractor === "gemini" || ex.extractor === "openrouter" ? <AIBadge>AI draft · {ex.confidence} confidence</AIBadge> : <Badge tone="warn">Automatic reading</Badge>}<span className="text-sm font-medium">Things to check before you confirm</span></div>
            <ul className="ml-4 list-disc space-y-1 text-sm text-ink/85 marker:text-ai/60">{ex.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Original document" action={doc && <a className="btn-secondary btn-sm" href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer"><FileText className="h-3.5 w-3.5" aria-hidden /> Open original</a>} className="lg:sticky lg:top-20 lg:self-start">
          {doc?.mime.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/documents/${doc.id}`} alt="Uploaded order" className="mb-3 max-h-[480px] w-full rounded-lg border border-line object-contain" />
          )}
          {doc?.textExtract ? (
            <>
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">Text {doc.textSource === "ocr" ? <Badge tone="warn">read by OCR — check carefully</Badge> : doc.textSource === "pdf_text" ? "from the PDF's text layer" : "as pasted"}</div>
              <OrderReveal jobId={job.id} text={doc.textExtract} facts={facts} play={job.status === "needs_review"} />
            </>
          ) : <p className="text-sm text-muted">No text could be extracted. Open the original to read it.</p>}
        </Card>
        <div className="space-y-4">
        {ex?.details && <AIDetails d={ex.details} />}
        <Card title={job.status === "needs_review" ? "What AdvoFlow found" : "Order details"}>
          <ReviewForm jobId={job.id} ex={ex} match={job.match} readOnly={readOnly} cases={ws.cases.filter((c) => c.status !== "archived").map((c) => ({ id: c.id, number: c.number, title: c.title }))} />
        </Card>
        </div>
      </div>
    </>
  );
}

const pg = (p: number | null | undefined) => (p ? ` (p. ${p})` : "");

/** Everything else the AI found, each item with its source passage so it can be checked against the original. */
function AIDetails({ d }: { d: OrderDetails }) {
  const row = (label: string, f: OrderDetails["bench"]) =>
    f.value ? <li><span className="text-muted">{label}:</span> {f.value} {f.status !== "stated" && <Badge tone="warn">not confirmed</Badge>}{f.source && <q className="block text-xs text-muted">{f.source}{pg(f.page)}</q>}</li> : null;
  return (
    <Card title={<span className="flex items-center gap-2">Also found in the order <AIBadge>AI draft</AIBadge></span>} className="ai-draft !bg-ai-soft/50">
      <ul className="space-y-2 text-sm">
        {row("Case type", d.caseType)}
        {row("Court location", d.courtLocation)}
        {row("Judge / bench", d.bench)}
        {d.parties.length > 0 && <li><span className="text-muted">Parties:</span> {d.parties.map((p) => `${p.name} (${p.role})`).join("; ")}</li>}
        {d.otherDates.map((x, i) => <li key={`d${i}`}><span className="text-muted">{x.kind.replace("_", " ")}:</span> {x.date ? formatDate(x.date) : "date not stated"} — {x.description}{x.source && <q className="block text-xs text-muted">{x.source}{pg(x.page)}</q>}</li>)}
        {d.deadlines.map((x, i) => <li key={`l${i}`}><span className="text-muted">Deadline:</span> {x.action} — {x.dueDate ? formatDate(x.dueDate) : x.dueAsWritten ?? "no date stated"}{x.responsible ? ` (${x.responsible})` : ""}{x.source && <q className="block text-xs text-muted">{x.source}{pg(x.page)}</q>}</li>)}
        {d.directions.map((x, i) => <li key={`r${i}`}><span className="text-muted">Direction{x.verbatim ? " (court's words)" : " (summary)"}:</span> {x.verbatim ? <q>{x.text}</q> : x.text}{pg(x.page)}</li>)}
      </ul>
      {d.missingOrAmbiguous.length > 0 && <p className="mt-3 text-xs text-warn">Missing or unclear: {d.missingOrAmbiguous.map((m) => m.field).join(", ")}</p>}
    </Card>
  );
}
