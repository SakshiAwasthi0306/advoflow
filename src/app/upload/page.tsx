import Link from "next/link";
import { pageData } from "@/lib/server";
import { config } from "@/lib/config";
import { demoOrders } from "@/lib/demo/seed";
import { formatDate } from "@/lib/dates";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { JobBadge } from "@/components/status";
import { UploadForm } from "@/components/upload-form";

export const metadata = { title: "Court orders" };

export default async function Upload({ searchParams }: { searchParams: { case?: string } }) {
  const { ws } = await pageData();
  const queue = ws.jobs.filter((j) => j.status === "needs_review" || j.status === "failed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recent = ws.jobs.filter((j) => j.status === "approved" || j.status === "rejected").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "")).slice(0, 8);
  const sample = demoOrders().os2.replace("O.S. No. 482/2025", "O.S. No. 615/2026").replace("Ramesh Kumar v. Suresh Rao", "Kavitha Shetty v. Mohan Gowda (fictional sample)").replace(/CNR: \S+\n/, "");
  const docName = (id: string) => ws.documents.find((d) => d.id === id)?.filename ?? "Document";
  return (
    <>
      <PageHeader eyebrow="Orders & research" title="Court orders" subtitle="Each order is read, matched to a case and held for your review. Nothing changes in your records until you confirm." />
      <div className="mb-4">
        {config.anthropicKey
          ? <Notice tone="navy" title="AI extraction is on">Orders are sent to Anthropic Claude for reading. Scans and photos are read with OCR. Every field still needs your review.</Notice>
          : <Notice tone="demo" title="Demo extraction (no AI)">A rule-based reader is used. It understands common English order phrasing and Kannada digits, reads text-based PDFs, and never guesses dates. Photos and scanned PDFs need an AI key, or you can enter the details by hand.</Notice>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><UploadForm defaultCase={searchParams.case ?? ""} sample={sample} /></Card>
        <div className="space-y-4">
          <Card title="Waiting for your review" id="queue">
            {queue.length ? (
              <ul className="divide-y divide-line text-sm">{queue.map((j) => (
                <li key={j.id} className="py-2"><Link href={`/review/${j.id}`} className="flex flex-wrap items-center gap-2 hover:text-navy-800"><span className="font-medium">{j.extraction?.caseNumber.value ?? docName(j.documentId)}</span><JobBadge status={j.status} /><span className="w-full text-xs text-muted">Uploaded {formatDate(j.createdAt.slice(0, 10))}</span></Link></li>
              ))}</ul>
            ) : <EmptyState title="Nothing to review" />}
          </Card>
          <Card title="Recently decided">
            {recent.length ? <ul className="divide-y divide-line text-sm">{recent.map((j) => <li key={j.id} className="py-2"><Link href={`/review/${j.id}`} className="flex flex-wrap items-center gap-2 hover:text-navy-800"><span>{j.extraction?.caseNumber.value ?? docName(j.documentId)}</span><JobBadge status={j.status} /></Link></li>)}</ul> : <p className="text-sm text-muted">None yet.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
