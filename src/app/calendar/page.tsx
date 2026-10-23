import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { pageData } from "@/lib/server";
import { calendarItems, type CalendarItem } from "@/lib/services/queries";
import { addDays, formatDate, isValidISODate, todayIST } from "@/lib/dates";
import { Badge, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { HearingBadge } from "@/components/status";
import { cx } from "@/components/ui";

export const metadata = { title: "Hearings" };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function chip(i: CalendarItem) {
  const style = i.kind === "deadline"
    ? i.status === "done" ? "border-ok-line bg-ok-soft text-ok line-through" : "border-warn-line bg-warn-soft text-warn"
    : i.status === "confirmed" ? "border-navy-100 bg-navy-50 text-navy-900"
    : i.status === "awaiting_verification" ? "border-dashed border-neutral-line bg-surface text-neutral"
    : "border-neutral-line bg-neutral-soft text-neutral line-through";
  const prefix = i.kind === "deadline" ? "Due" : i.status === "confirmed" ? "Hearing" : i.status === "awaiting_verification" ? "Unconfirmed" : i.status === "held" ? "Held" : "Superseded";
  return (
    <Link key={i.kind + i.id} href={`/cases/${i.caseId}?tab=${i.kind === "deadline" ? "tasks" : "orders"}`} className={cx("block truncate rounded border px-1.5 py-0.5 text-[11px]", style)} title={`${prefix}: ${i.caseNumber} – ${i.title}`}>
      <span className="font-semibold">{prefix}</span> {i.caseNumber}
    </Link>
  );
}

export default async function Calendar({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const { ws } = await pageData();
  const today = todayIST();
  const view = searchParams.view === "week" ? "week" : searchParams.view === "agenda" ? "agenda" : "month";
  const anchor = isValidISODate(searchParams.d) ? searchParams.d! : today;
  const kind = searchParams.kind ?? "all";
  const status = searchParams.status ?? "current";
  const caseFilter = searchParams.case ?? "";
  let items = calendarItems(ws, { includeSuperseded: status === "all" });
  if (kind !== "all") items = items.filter((i) => i.kind === kind);
  if (status === "confirmed") items = items.filter((i) => i.kind === "deadline" || i.status === "confirmed");
  if (status === "unconfirmed") items = items.filter((i) => i.status === "awaiting_verification");
  if (caseFilter) items = items.filter((i) => i.caseId === caseFilter);
  const byDate = new Map<string, CalendarItem[]>();
  for (const i of items) byDate.set(i.date, [...(byDate.get(i.date) ?? []), i]);

  const [y, m] = anchor.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const dow = (d: string) => (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
  const gridStart = addDays(monthStart, -dow(monthStart));
  const weekStart = addDays(anchor, -dow(anchor));
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const prev = view === "week" ? addDays(anchor, -7) : view === "month" ? addDays(monthStart, -1).slice(0, 8) + "01" : addDays(anchor, -30);
  const next = view === "week" ? addDays(anchor, 7) : view === "month" ? addDays(addDays(monthStart, 32).slice(0, 8) + "01", 0) : addDays(anchor, 30);
  const q = (p: Record<string, string>) => `/calendar?${new URLSearchParams({ view, d: anchor, kind, status, ...(caseFilter ? { case: caseFilter } : {}), ...p })}`;
  const title = view === "agenda" ? `From ${formatDate(anchor)}` : view === "week" ? `Week of ${formatDate(weekStart)}` : new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const agenda = items.filter((i) => i.date >= anchor).slice(0, 120);

  return (
    <>
      <PageHeader eyebrow="Practice" title="Hearings" subtitle="Hearings and deadlines from your confirmed records." actions={<a href="/api/calendar" className="btn-secondary"><Download className="h-4 w-4" aria-hidden /> Export CSV</a>} />
      <div className="mb-4"><Notice tone="neutral">Only advocate-confirmed dates show as confirmed hearings. Unconfirmed dates are dashed and labelled. CSV export works with Google Calendar import; there is no live calendar sync.</Notice></div>
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="flex gap-1" role="group" aria-label="View">
          {(["month", "week", "agenda"] as const).map((v) => <Link key={v} href={q({ view: v })} aria-current={v === view ? "page" : undefined} className={v === view ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{v[0].toUpperCase() + v.slice(1)}</Link>)}
        </div>
        <div className="flex items-center gap-1">
          <Link href={q({ d: prev })} className="btn-ghost btn-sm" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href={q({ d: today })} className="btn-secondary btn-sm">Today</Link>
          <Link href={q({ d: next })} className="btn-ghost btn-sm" aria-label="Next"><ChevronRight className="h-4 w-4" /></Link>
          <span className="ml-1 font-semibold">{title}</span>
        </div>
        <form className="ml-auto flex flex-wrap gap-2" aria-label="Filters">
          <input type="hidden" name="view" value={view} /><input type="hidden" name="d" value={anchor} />
          <select name="kind" defaultValue={kind} className="input w-auto py-1" aria-label="Type"><option value="all">Hearings and deadlines</option><option value="hearing">Hearings only</option><option value="deadline">Deadlines only</option></select>
          <select name="status" defaultValue={status} className="input w-auto py-1" aria-label="Status"><option value="current">Current</option><option value="confirmed">Confirmed only</option><option value="unconfirmed">Awaiting verification</option><option value="all">Include superseded</option></select>
          <select name="case" defaultValue={caseFilter} className="input w-auto py-1" aria-label="Case"><option value="">All cases</option>{ws.cases.filter((c) => c.status !== "archived").map((c) => <option key={c.id} value={c.id}>{c.number}</option>)}</select>
          <button className="btn-secondary btn-sm">Apply</button>
        </form>
      </div>

      {view === "agenda" ? (
        agenda.length ? (
          <Card>
            <ul className="divide-y divide-line">
              {agenda.map((i) => (
                <li key={i.kind + i.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className={cx("w-28 tabular-nums", i.date === today && "font-semibold text-navy-900")}>{formatDate(i.date)}</span>
                  {i.kind === "hearing" ? <HearingBadge status={i.status as never} /> : <Badge tone={i.status === "done" ? "ok" : "warn"}>{i.status === "done" ? "Done" : "Deadline"}</Badge>}
                  <Link href={`/cases/${i.caseId}`} className="font-medium hover:underline">{i.caseNumber}</Link>
                  <span className="text-muted">{i.title}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : <EmptyState title="Nothing scheduled from this date" />
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-7 border-b border-line">{DOW.map((d) => <div key={d} className="th text-center">{d}</div>)}</div>
          <div className="grid min-w-[720px] grid-cols-7">
            {days.map((d) => {
              const inMonth = view === "week" || d.slice(0, 7) === monthStart.slice(0, 7);
              const list = byDate.get(d) ?? [];
              return (
                <div key={d} className={cx("border-b border-r border-line p-1.5", view === "week" ? "min-h-[220px]" : "min-h-[104px]", !inMonth && "bg-paper/60")}>
                  <div className={cx("mb-1 text-xs", d === today ? "inline-grid h-6 w-6 place-items-center rounded-full bg-navy-900 font-semibold text-surface" : inMonth ? "text-ink" : "text-muted")}>{Number(d.slice(8))}</div>
                  <div className="space-y-1">{list.slice(0, view === "week" ? 12 : 3).map(chip)}{list.length > (view === "week" ? 12 : 3) && <Link href={q({ view: "agenda", d })} className="text-[11px] text-navy-800">+{list.length - 3} more</Link>}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted" aria-label="Legend">
        <span className="rounded border border-navy-100 bg-navy-50 px-1.5 text-navy-900">Hearing = confirmed</span>
        <span className="rounded border border-dashed border-neutral-line px-1.5">Unconfirmed = awaiting verification</span>
        <span className="rounded border border-warn-line bg-warn-soft px-1.5 text-warn">Due = task deadline</span>
        <span className="rounded border border-neutral-line bg-neutral-soft px-1.5 line-through">Superseded / held</span>
      </div>
    </>
  );
}
