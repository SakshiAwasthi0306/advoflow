import Link from "next/link";
import { notFound } from "next/navigation";
import { pageData } from "@/lib/server";
import { formatDate } from "@/lib/dates";
import { Card, PageHeader } from "@/components/ui";
import { ResearchStart } from "@/components/widgets";

export const metadata = { title: "Start research" };

export default async function NewResearch({ searchParams }: { searchParams: { case?: string; order?: string } }) {
  const { ws } = await pageData();
  const c = ws.cases.find((x) => x.id === searchParams.case);
  if (!c) notFound();
  const orders = ws.orders.filter((o) => o.caseId === c.id).sort((a, b) => (b.orderDate ?? "").localeCompare(a.orderDate ?? ""));
  if (searchParams.order) orders.sort((a, b) => (a.id === searchParams.order ? -1 : b.id === searchParams.order ? 1 : 0));
  const docs = ws.documents.filter((d) => d.caseId === c.id && !orders.some((o) => o.documentId === d.id));
  return (
    <>
      <PageHeader eyebrow={<Link className="link" href={`/cases/${c.id}?tab=research`}>{c.number}</Link>} title="Start legal research" subtitle="Choose the approved orders and documents that should inform this run." />
      <Card><ResearchStart caseId={c.id} orders={orders.map((o) => ({ id: o.id, label: `Order of ${formatDate(o.orderDate)}${o.stage ? ` · ${o.stage}` : ""}` }))} docs={docs.map((d) => ({ id: d.id, label: d.filename }))} /></Card>
    </>
  );
}
