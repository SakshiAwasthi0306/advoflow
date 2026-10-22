import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { pageData } from "@/lib/server";
import { formatDate } from "@/lib/dates";
import { Badge, Card, DemoBadge, Notice, PageHeader } from "@/components/ui";
import { JobBadge } from "@/components/status";
import { ActionButton } from "@/components/client";
import { ReviewForm } from "@/components/review-form";

export const metadata = { title: "Review order" };

export default async function Review({ params }: { params: { id: string } }) {
  const { ws } = await pageData();
  const job = ws.jobs.find((j) => j.id === params.id);
  if (!job) notFound();
  const doc = ws.documents.find((d) => d.id === job.documentId);
  const ex = job.extraction;
  const order = job.resultOrderId ? ws.orders.find((o) => o.id === job.resultOrderId) : null;
  const readOnly = job.status === "approved" || job.status === "rejected";
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/upload" className="link">Upload Orders</Link>}
        title={job.status === "failed" ? "Enter order details" : "Review and confirm"}
        subtitle={<span className="flex flex-wrap items-center gap-2"><JobBadge status={job.status} />{doc?.filename}{doc?.isDemo && <DemoBadge />}{ex && <span className="text-muted">· {ex.extractor === "anthropic" ? `Read by Claude (${ex.model})` : ex.extractor === "case-diary-import" ? "Imported from the Case Diary prototype" : "Read by the rule-based demo extractor"} · confidence {ex.confidence}</span>}</span>}
        actions={job.status === "rejected" ? <ActionButton url={`/api/jobs/${job.id}`} body={{ action: "reopen" }} success="Reopened for review">Reopen</ActionButton> : order ? <Link className="btn-primary" href={`/cases/${order.caseId}?tab=orders`}>Open case</Link> : null}
      />
      <div className="mb-4 space-y-2">
        {job.status === "failed" && <Notice tone="danger" title="This document could not be read automatically">{job.error} The original is saved. Fill in the details below by hand, or upload a clearer copy to try again.</Notice>}
        {job.status === "approved" && <Notice tone="ok" title={`Approved ${job.decidedAt ? formatDate(job.decidedAt.slice(0, 10)) : ""}`}>This order is in the case timeline. Approving again would not create duplicates.</Notice>}
        {job.status === "rejected" && <Notice tone="neutral" title="Rejected">No records were changed. The document is kept; reopen to review it again.</Notice>}
        {job.conflicts.map((c, i) => <Notice key={i} tone="warn">{c}</Notice>)}
        {ex?.warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
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
              <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 font-mono text-[12.5px] leading-relaxed">{doc.textExtract}</pre>
            </>
          ) : <p className="text-sm text-muted">No text could be extracted. Open the original to read it.</p>}
        </Card>
        <Card title="Proposed update">
          <ReviewForm jobId={job.id} ex={ex} match={job.match} readOnly={readOnly} cases={ws.cases.filter((c) => c.status !== "archived").map((c) => ({ id: c.id, number: c.number, title: c.title }))} />
        </Card>
      </div>
    </>
  );
}
