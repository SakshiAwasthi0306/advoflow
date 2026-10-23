import Link from "next/link";
import { pageData } from "@/lib/server";
import { formatDate, todayIST } from "@/lib/dates";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DueBadge } from "@/components/status";
import { AddTaskForm, RescheduleActions, TaskEdit, TaskToggle } from "@/components/widgets";
import { SwipeTask } from "@/components/delight";

export const metadata = { title: "Tasks" };
const FILTERS = [["open", "All open"], ["overdue", "Overdue"], ["today", "Due today"], ["upcoming", "Upcoming"], ["nodate", "No date"], ["done", "Completed"]] as const;

export default async function Tasks({ searchParams }: { searchParams: { filter?: string; sort?: string } }) {
  const { ws } = await pageData();
  const today = todayIST();
  const filter = searchParams.filter ?? "open";
  const sort = searchParams.sort ?? "due";
  const live = new Set(ws.cases.filter((c) => c.status !== "archived").map((c) => c.id));
  const all = ws.tasks.filter((t) => live.has(t.caseId));
  const count = (f: string) => all.filter((t) => match(t, f)).length;
  function match(t: (typeof all)[number], f: string) {
    if (f === "done") return t.status === "done";
    if (t.status !== "open") return false;
    if (f === "overdue") return !!t.dueDate && t.dueDate < today;
    if (f === "today") return t.dueDate === today;
    if (f === "upcoming") return !!t.dueDate && t.dueDate > today;
    if (f === "nodate") return !t.dueDate;
    return true;
  }
  const rank = { high: 0, normal: 1, low: 2 } as const;
  const tasks = all.filter((t) => match(t, filter)).sort((a, b) =>
    sort === "priority" ? rank[a.priority] - rank[b.priority] || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")
    : filter === "done" ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
    : (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") || rank[a.priority] - rank[b.priority]);
  const caseOf = (id: string) => ws.cases.find((c) => c.id === id);

  return (
    <>
      <PageHeader eyebrow="Practice" title="Tasks" subtitle="Every task across your cases. Tasks suggested by the AI only appear here after you approve them." />
      <Card title="Add a task" className="mb-4"><AddTaskForm cases={ws.cases.filter((c) => c.status === "active").map((c) => ({ id: c.id, number: c.number }))} /></Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, label]) => <Link key={k} href={`/tasks?filter=${k}&sort=${sort}`} aria-current={k === filter ? "page" : undefined} className={k === filter ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{label} <span className="opacity-70">({count(k)})</span></Link>)}
        <span className="ml-auto text-sm text-muted">Sort: <Link className={sort === "due" ? "font-semibold text-ink" : "link"} href={`/tasks?filter=${filter}&sort=due`}>due date</Link> · <Link className={sort === "priority" ? "font-semibold text-ink" : "link"} href={`/tasks?filter=${filter}&sort=priority`}>priority</Link></span>
      </div>
      {tasks.length ? (
        <Card>
          <p className="mb-1 text-xs text-muted sm:hidden">Swipe a task right to finish it, or left to push it a day.</p>
          <ul className="divide-y divide-line">
            {tasks.map((t) => {
              const c = caseOf(t.caseId);
              return (
                <li key={t.id}>{(() => { const row = (
                <div className="flex gap-3 py-3">
                  <TaskToggle key={t.id} id={t.id} done={t.status === "done"} title={t.title} />
                  <div className="min-w-0 flex-1">
                    <div className={t.status === "done" ? "text-muted line-through" : "font-medium"}>{t.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Link href={`/cases/${t.caseId}?tab=tasks`} className="link">{c?.number}</Link>
                      <DueBadge task={t} today={today} />
                      {t.dueDate && <span>{formatDate(t.dueDate)}</span>}
                      {t.priority === "high" && t.status === "open" && <Badge tone="danger" icon={false}>High</Badge>}
                      <span>{t.source === "order" ? "From an approved order" : t.source === "research" ? "From research" : "Manual"}</span>
                      <span>Created {formatDate(t.createdAt.slice(0, 10))}</span>
                      {t.completedAt && <span>Completed {formatDate(t.completedAt.slice(0, 10))}</span>}
                    </div>
                    {t.needsReschedule && t.status === "open" && <div className="mt-2 rounded-lg border border-warn-line bg-warn-soft p-2 text-sm"><div className="mb-1 font-medium text-warn">Hearing moved from {formatDate(t.needsReschedule.from)} to {formatDate(t.needsReschedule.to)}.</div><RescheduleActions id={t.id} from={t.needsReschedule.from} to={t.needsReschedule.to} /></div>}
                    {t.status === "open" && <TaskEdit key={`${t.id}:${t.title}:${t.dueDate}:${t.priority}`} id={t.id} title={t.title} dueDate={t.dueDate} priority={t.priority} />}
                  </div>
                </div>);
                return t.status === "open" ? <SwipeTask id={t.id} dueDate={t.dueDate} today={today}>{row}</SwipeTask> : row; })()}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : <EmptyState title="No tasks here" body={filter === "overdue" ? "Nothing is overdue." : undefined} />}
    </>
  );
}
