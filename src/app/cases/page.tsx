import Link from "next/link";
import { CircleAlert, ListChecks, PenLine, Plus, SlidersHorizontal } from "lucide-react";
import { pageData } from "@/lib/server";
import { caseSummary } from "@/lib/services/queries";
import { addDays, formatDate, todayIST } from "@/lib/dates";
import { Badge, DateBlock, DemoBadge, EmptyState, PageHeader } from "@/components/ui";
import { HearingBadge } from "@/components/status";
import type { CaseRecord } from "@/lib/types";

export const metadata = { title: "Case diary" };
const PAGE = 25;

type Row = { c: CaseRecord; s: ReturnType<typeof caseSummary> };
type Group = "passed" | "today" | "week" | "later" | "none";
const GROUPS: { key: Group; title: string; note: string }[] = [
  { key: "passed", title: "Date passed: needs updating", note: "The hearing date has gone by. Record the order to set the next date." },
  { key: "today", title: "Today", note: "" },
  { key: "week", title: "This week", note: "" },
  { key: "later", title: "Later", note: "" },
  { key: "none", title: "No date yet", note: "Add a hearing or record an order to put these on the calendar." },
];

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
  let rows: Row[] = ws.cases
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
      if (when === "week") return d >= today && d <= addDays(today, 7);
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
  const groupOf = ({ s }: Row): Group => {
    const d = s.hearing?.date;
    if (!d) return "none";
    if (d < today) return "passed";
    if (d === today) return "today";
    if (d <= addDays(today, 7)) return "week";
    return "later";
  };
  const filtered = !!(q || court || stage || when || status !== "active");
  const counts = { passed: 0, today: 0, week: 0 };
  for (const r of ws.cases.filter((c) => c.status === "active").map((c) => ({ c, s: caseSummary(ws, c, today) }))) {
    const g = groupOf(r);
    if (g === "passed" || g === "today" || g === "week") counts[g]++;
  }

  const Entry = ({ c, s }: Row) => {
    const g = groupOf({ c, s });
    return (
      <li>
        <Link href={`/cases/${c.id}`} className={`group relative flex gap-4 rounded-lg px-3 py-3.5 transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-surface hover:shadow-lift sm:gap-5 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-full before:opacity-0 before:transition-opacity hover:before:opacity-100 ${g === "passed" ? "before:bg-danger" : g === "today" ? "before:bg-accent" : g === "week" ? "before:bg-teal-500" : "before:bg-violet-400"}`}>
          {s.hearing ? <DateBlock date={s.hearing.date} tone={g === "today" ? "today" : g === "passed" ? "overdue" : "neutral"} /> : <div className="grid h-[58px] w-[52px] shrink-0 place-items-center rounded-lg border border-dashed border-line text-[10px] font-medium uppercase tracking-[0.08em] text-muted">No date</div>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="ref text-[15px] font-medium text-navy-900 group-hover:underline group-hover:decoration-navy-700/40 group-hover:underline-offset-4">{c.number}</span>
              {c.isDemo && <DemoBadge />}
              {c.status !== "active" && <Badge tone="neutral" icon={false}>{c.status === "closed" ? "Closed" : "Archived"}</Badge>}
              {s.hearing && <HearingBadge status={s.hearing.status} />}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[14.5px] leading-snug text-ink/90">{c.title || <span className="text-muted">Parties not entered</span>}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
              <span className="max-w-full truncate">{c.court || "Court not entered"}</span>
              {c.stage && <span>Stage: {c.stage}</span>}
              {s.hearing?.purpose && s.hearing.purpose !== c.stage && <span>Next: {s.hearing.purpose}</span>}
              {clientName(c.clientId) && <span>Client: {clientName(c.clientId)}</span>}
            </div>
          </div>
          <div className="hidden shrink-0 flex-col items-end gap-1.5 text-xs sm:flex">
            {s.verification === "needs_review" && <span className="ai-chip"><PenLine className="h-3 w-3" aria-hidden />Order to check</span>}
            {s.verification === "unconfirmed_date" && <Badge tone="neutral">Date to confirm</Badge>}
            {s.overdue > 0 ? <span className="inline-flex items-center gap-1 font-medium text-danger"><CircleAlert className="h-3.5 w-3.5" aria-hidden />{s.overdue} overdue</span>
              : s.openTasks > 0 ? <span className="inline-flex items-center gap-1 text-muted"><ListChecks className="h-3.5 w-3.5" aria-hidden />{s.openTasks} open task{s.openTasks === 1 ? "" : "s"}</span>
              : <span className="text-muted/80">No open tasks</span>}
            <span className="num text-muted/80">Updated {formatDate(c.updatedAt.slice(0, 10))}</span>
          </div>
        </Link>
        {/* Mobile: the same facts, under the entry */}
        <div className="-mt-2 flex flex-wrap gap-2 px-3 pb-3 pl-[84px] sm:hidden">
          {s.verification === "needs_review" && <span className="ai-chip">Order to check</span>}
          {s.overdue > 0 && <Badge tone="danger">{s.overdue} overdue</Badge>}
          {!s.overdue && s.openTasks > 0 && <Badge tone="neutral" icon={false}>{s.openTasks} open task{s.openTasks === 1 ? "" : "s"}</Badge>}
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Practice"
        title="Case diary"
        subtitle={total ? <>
          <span className="num">{total}</span> {filtered ? "matching" : status === "active" ? "active" : ""} case{total === 1 ? "" : "s"}
          {!filtered && (counts.today || counts.week || counts.passed) ? <> · {[counts.today && `${counts.today} in court today`, counts.week && `${counts.week} this week`, counts.passed && <span key="p" className="text-danger">{counts.passed} with a date that has passed</span>].filter(Boolean).map((x, i, a) => <span key={i}>{x}{i < a.length - 1 ? ", " : ""}</span>)}</> : null}
        </> : undefined}
        actions={<Link href="/cases/new" className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> New case</Link>}
      />

      <form className="mb-6 flex flex-wrap items-end gap-2" role="search" aria-label="Filter cases">
        <div className="min-w-[220px] flex-[2]"><label className="sr-only" htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} className="input" placeholder="Search number, party, CNR, court or client" /></div>
        <details className="group contents" open={filtered || undefined}>
          <summary className="btn-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden"><SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters{filtered ? " · on" : ""}</summary>
          <div className="flex w-full flex-wrap gap-2">
            <div className="min-w-[150px] flex-1"><label className="label" htmlFor="court">Court</label><select id="court" name="court" defaultValue={court} className="input"><option value="">All courts</option>{courts.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="min-w-[140px] flex-1"><label className="label" htmlFor="stage">Stage</label><select id="stage" name="stage" defaultValue={stage} className="input"><option value="">All stages</option>{stages.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="min-w-[140px] flex-1"><label className="label" htmlFor="when">Next hearing</label><select id="when" name="when" defaultValue={when} className="input"><option value="">Any</option><option value="week">Within 7 days</option><option value="past">Date has passed</option><option value="none">No date</option></select></div>
            <div className="min-w-[120px] flex-1"><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={status} className="input"><option value="active">Active</option><option value="closed">Closed</option><option value="archived">Archived</option><option value="all">All</option></select></div>
            <div className="min-w-[140px] flex-1"><label className="label" htmlFor="sort">Order by</label><select id="sort" name="sort" defaultValue={sort} className="input"><option value="next">Next hearing</option><option value="updated">Last updated</option><option value="number">Case number</option></select></div>
          </div>
        </details>
        <button className="btn-primary">Search</button>
        {filtered && <Link href="/cases" className="btn-ghost">Clear</Link>}
      </form>

      {!total ? (
        <EmptyState
          title={ws.cases.length ? "Nothing matches that" : "Your diary is ready for its first case"}
          body={ws.cases.length ? "Try a shorter search, or clear the filters." : "Add a case by hand, or record a court order and AdvoFlow will draft the case for you to check."}
          action={ws.cases.length ? <Link href="/cases" className="btn-secondary">Clear filters</Link> : <span className="flex flex-wrap justify-center gap-2"><Link href="/cases/new" className="btn-primary">Add a case</Link><Link href="/upload" className="btn-secondary">Record an order</Link></span>}
        />
      ) : sort === "next" ? (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const items = rows.filter((r) => groupOf(r) === g.key);
            if (!items.length) return null;
            return (
              <section key={g.key} aria-labelledby={`g-${g.key}`}>
                <div className="mb-1 flex items-baseline gap-3 border-b border-line pb-2">
                  <span aria-hidden className={`h-2.5 w-2.5 shrink-0 translate-y-[-1px] self-center rounded-full ${{ passed: "bg-danger", today: "bg-accent", week: "bg-teal-500", later: "bg-violet-400", none: "bg-muted/50" }[g.key]}`} />
                  <h2 id={`g-${g.key}`} className={`display text-lg font-medium ${g.key === "passed" ? "text-danger" : g.key === "today" ? "text-accent" : ""}`}>{g.title}</h2>
                  <span className="num text-xs text-muted">{items.length}</span>
                  {g.note && <span className="hidden text-xs text-muted md:inline">{g.note}</span>}
                </div>
                <ul className="-mx-3 divide-y divide-line/60">{items.map((r) => <Entry key={r.c.id} {...r} />)}</ul>
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="-mx-3 divide-y divide-line/60 border-t border-line">{rows.map((r) => <Entry key={r.c.id} {...r} />)}</ul>
      )}

      {total > PAGE && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between border-t border-line pt-4 text-sm">
          <span className="num text-muted">Page {page} of {Math.ceil(total / PAGE)}</span>
          <span className="flex gap-2">{page > 1 && <Link className="btn-secondary btn-sm" href={qs({ page: page - 1 })}>Previous</Link>}{page * PAGE < total && <Link className="btn-secondary btn-sm" href={qs({ page: page + 1 })}>Next</Link>}</span>
        </nav>
      )}
    </>
  );
}
