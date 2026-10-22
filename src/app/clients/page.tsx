import Link from "next/link";
import { pageData } from "@/lib/server";
import { formatDate } from "@/lib/dates";
import { Badge, Card, DemoBadge, EmptyState, PageHeader } from "@/components/ui";
import { ClientForm } from "@/components/client-form";

export const metadata = { title: "Clients" };

export default async function Clients() {
  const { ws } = await pageData();
  const clients = [...ws.clients].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Clients" subtitle="Contact details, linked cases and the messages prepared for each client." />
      <Card title="Add a client" className="mb-4"><ClientForm /></Card>
      {clients.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {clients.map((cl) => {
            const cases = ws.cases.filter((c) => c.clientId === cl.id);
            const msgs = ws.clientUpdates.filter((u) => u.clientId === cl.id || cases.some((c) => c.id === u.caseId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            return (
              <Card key={cl.id} title={<span className="flex items-center gap-2">{cl.name}{cl.isDemo && <DemoBadge />}</span>}>
                <p className="text-sm text-muted">{cl.phone ?? "No phone"}{cl.email ? ` · ${cl.email}` : ""} · {cl.preferredLanguage === "kn" ? "Kannada" : "English"} · prefers {cl.preferredChannel}</p>
                {cl.notes && <p className="mt-1 text-sm">{cl.notes}</p>}
                <div className="mt-3 text-sm"><div className="font-medium">Cases</div>{cases.length ? <ul>{cases.map((c) => <li key={c.id}><Link href={`/cases/${c.id}?tab=client`} className="link">{c.number}</Link> <span className="text-muted">{c.title}</span></li>)}</ul> : <p className="text-muted">None linked. Link a case from its Overview tab.</p>}</div>
                <div className="mt-3 text-sm"><div className="font-medium">Communication history</div>{msgs.length ? <ul className="space-y-1">{msgs.slice(0, 5).map((u) => <li key={u.id} className="flex flex-wrap items-center gap-2"><Badge tone={u.status === "handed_off" ? "navy" : "neutral"} icon={false}>{u.status === "handed_off" ? "Opened in WhatsApp" : "Draft"}</Badge><span className="text-muted">{u.lang === "kn" ? "Kannada" : "English"} · {formatDate(u.updatedAt.slice(0, 10))}</span></li>)}</ul> : <p className="text-muted">No messages yet.</p>}</div>
                <details className="mt-3"><summary className="cursor-pointer text-sm text-navy-800">Edit client</summary><div className="mt-3"><ClientForm id={cl.id} initial={{ name: cl.name, phone: cl.phone ?? "", email: cl.email ?? "", preferredLanguage: cl.preferredLanguage, preferredChannel: cl.preferredChannel, notes: cl.notes }} /></div></details>
              </Card>
            );
          })}
        </div>
      ) : <EmptyState title="No clients yet" body="Add a client, then link them to their cases." />}
    </>
  );
}
