import Link from "next/link";
import { Plus } from "lucide-react";
import { pageData } from "@/lib/server";
import { caseSummary } from "@/lib/services/queries";
import { formatDate, todayIST } from "@/lib/dates";
import { Badge, DemoBadge, EmptyState, PageHeader } from "@/components/ui";
import { HearingBadge } from "@/components/status";

export const metadata = { title: "My Cases" };
const PAGE = 25;

export default async function Cases({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { ws } = await pageData();
  const today = todayIST();
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const status = searchParams.status ?? "active";
  const court = searchParams.court ?? "";
  const stage = searchParams.stage ?? "";
  const when = searchParams.when ?? "";
  const sort = searchParams.sort ?? "next";
  const page = Math.max(1, Number(searchParams.page ?? 1));

  const clientName = (id: string | null) => ws.clients.find((c) => c.id === id)?.name ?? "";
  let rows = ws.cases
    .filter((c) => (status === "all" ? true : c.status === status))
    .filter((c) => !q || [c.number, c.title, c.cnr ?? "", c.court, clientName(c.clientId)].join(" ").toLowerCase().includes(q))
    .filter((c) => !court || c.court === court)
    .filter((c) => !stage || c.stage === stage)
    .map((c) => ({ c, s: caseSummary(ws, c, today) }))
    .filter(({ s }) => {
      if (!when) return true;
      const d = s.hearing?.date;
      if (when === "none") return !d;
      if (!d) return false;
      if (when === "week") return d >= today && d <= new Date(Date.parse(today) + 7 * 864e5).toISOString().slice(0, 10);
      if (when === "past") return d < today;
      return true;
    });
  rows.sort((a, b) =>
    sort === "updated" ? b.c.updatedAt.localeCompare(a.c.updatedAt)
    : sort === "number" ? a.c.number.localeCompare(b.c.number, "en", { numeric: true })
    : (a.s.hearing?.date ?? "9999").localeCompare(b.s.hearing?.date ?? "9999"),
  );
  const total = rows.length;
  rows = rows.slice((page - 1) * PAGE, page * PAGE);
  const courts = [...new Set(ws.cases.map((c) => c.court).filter(Boolean))].sort();
  const stages = [...new Set(ws.cases.map((c) => c.stage).filter(Boolean))].sort();
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams(Object.entries({ q, status, court, stage, when, sort, page: String(page), ...patch }).filter(([, v]) => v !== "" && v !== undefined).map(([k, v]) => [k, String(v)]));
    return `/cases?${p}`;
  };

  return (
    <>
      <PageHeader title="My Cases" subtitle={`${total} case${total === 1 ? "" : "s"}`} actions={<Link href="/cases/new" className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> New case</Link>} />
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filter cases">
        <div className="lg:col-span-2"><label className="label" htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} className="input" placeholder="Number, party, CNR, court, client" /></div>
        <div><label className="label" htmlFor="court">Court</label><select id="court" name="court" defaultValue={court} className="input"><option value="">All courts</option>{courts.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><label className="label" htmlFor="stage">Stage</label><select id="stage" name="stage" defaultValue={stage} className="input"><option value="">All stages</option>{stages.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="label" htmlFor="when">Next hearing</label><select id="when" name="when" defaultValue={when} className="input"><option value="">Any</option><option value="week">Within 7 days</option><option value="past">Date has passed</option><option value="none">No date</option></select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={status} className="input"><option value="active">Active</option><option value="closed">Closed</option><option value="archived">Archived</option><option value="all">All</option></select></div>
          <div><label className="label" htmlFor="sort">Sort</label><select id="sort" name="sort" defaultValue={sort} className="input"><option value="next">Next hearing</option><option value="updated">Last updated</option><option value="number">Case number</option></select></div>
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6"><button className="btn-primary btn-sm">Apply</button><Link href="/cases" className="btn-ghost btn-sm">Reset</Link></div>
      </form>

      {!total ? (
        <EmptyState title={ws.cases.length ? "No cases match these filters" : "No cases yet"} body={ws.cases.length ? "Try clearing a filter." : "Add a case by hand or upload an order."} action={<Link href="/cases/new" className="btn-primary">New case</Link>} />
      ) : (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full">
              <thead><tr><th className="th">Case</th><th className="th">Court</th><th className="th">Stage</th><th className="th">Next hearing</th><th className="th">Tasks</th><th className="th">Verification</th><th className="th">Updated</th></tr></thead>
              <tbody>
                {rows.map(({ c, s }) => (
                  <tr key={c.id} className="hover:bg-navy-50/50">
                    <td className="td"><Link href={`/cases/${c.id}`} className="font-medium text-navy-900 hover:underline">{c.number}</Link> {c.isDemo && <DemoBadge />}<div className="max-w-[260px] truncate text-xs text-muted">{c.title || "Parties not entered"}{c.caseType ? ` · ${c.caseType}` : ""}</div></td>
                    <td className="td max-w-[200px] text-muted">{c.court || "—"}</td>
                    <td className="td">{c.stage || <span className="text-muted">—</span>}</td>
                    <td className="td whitespace-nowrap">{s.hearing ? <><div>{formatDate(s.hearing.date)}</div><HearingBadge status={s.hearing.status} /></> : <span className="text-muted">None</span>}</td>
                    <td className="td">{s.openTasks}{s.overdue ? <div><Badge tone="danger">{s.overdue} overdue</Badge></div> : null}</td>
                    <td className="td">{s.verification === "needs_review" ? <Badge tone="warn">Order to review</Badge> : s.verification === "unconfirmed_date" ? <Badge tone="neutral">Date unconfirmed</Badge> : <Badge tone="ok">Up to date</Badge>}</td>
                    <td className="td whitespace-nowrap text-muted">{formatDate(c.updatedAt.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {rows.map(({ c, s }) => (
              <li key={c.id} className="card p-4">
                <Link href={`/cases/${c.id}`} className="font-medium text-navy-900">{c.number}</Link> {c.isDemo && <DemoBadge />}
                <div className="text-sm text-muted">{c.title}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">{s.hearing ? <><span>{formatDate(s.hearing.date)}</span><HearingBadge status={s.hearing.status} /></> : <span className="text-muted">No hearing date</span>}{s.overdue ? <Badge tone="danger">{s.overdue} overdue</Badge> : null}{s.verification === "needs_review" && <Badge tone="warn">Order to review</Badge>}</div>
              </li>
            ))}
          </ul>
          {total > PAGE && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted">Page {page} of {Math.ceil(total / PAGE)}</span>
              <span className="flex gap-2">{page > 1 && <Link className="btn-secondary btn-sm" href={qs({ page: page - 1 })}>Previous</Link>}{page * PAGE < total && <Link className="btn-secondary btn-sm" href={qs({ page: page + 1 })}>Next</Link>}</span>
            </nav>
          )}
        </>
      )}
    </>
  );
}
