import Link from "next/link";
import { ArrowRight, BookOpen, Briefcase, CalendarClock, ListPlus, Upload } from "lucide-react";
import { pageData } from "@/lib/server";
import { dashboard, MINUTES_PER_ORDER } from "@/lib/services/queries";
import { formatDate, todayIST } from "@/lib/dates";
import { Badge, Card, DemoBadge, EmptyState, PageHeader, Stat } from "@/components/ui";
import { DueBadge, HearingBadge } from "@/components/status";
import { ActionButton } from "@/components/client";

export default async function Dashboard() {
  const { ws, session } = await pageData();
  const d = dashboard(ws);
  const today = todayIST();
  const caseOf = (id: string) => ws.cases.find((c) => c.id === id);
  const greeting = `Today, ${formatDate(today)}`;

  if (!ws.cases.length && !ws.jobs.length) {
    return (
      <>
        <PageHeader title="Welcome to AdvoFlow" subtitle="Upload a court order. See what happened, what needs attention, and what to research next." />
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Start with your own cases">
            <p className="mb-4 text-sm text-muted">Add a case by hand, or upload an order and AdvoFlow will propose the case details for you to review.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/upload" className="btn-primary"><Upload className="h-4 w-4" aria-hidden /> Upload a court order</Link>
              <Link href="/cases/new" className="btn-secondary"><Briefcase className="h-4 w-4" aria-hidden /> Add a case</Link>
            </div>
          </Card>
          <Card title="Or explore with sample data">
            <p className="mb-4 text-sm text-muted">Loads three <strong>fictional</strong> cases with orders, hearings, a date change, tasks, client drafts and a research report. Everything is labelled Demo and can be removed in Settings.</p>
            {session.role === "owner" ? <ActionButton url="/api/demo" body={{ action: "load" }} className="btn-primary" success="Demo workspace loaded">Load demo workspace</ActionButton> : <p className="text-sm text-muted">Ask the office owner to load the demo.</p>}
          </Card>
        </div>
      </>
    );
  }

  const row = (caseId: string, children: React.ReactNode, href: string) => {
    const c = caseOf(caseId);
    return (
      <li className="border-t border-line first:border-0">
        <Link href={href} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm hover:text-navy-800">
          <span className="font-medium">{c?.number}</span>
          {c?.isDemo && <DemoBadge />}
          <span className="min-w-0 flex-1 truncate text-muted">{c?.title}</span>
          {children}
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={greeting}
        title="Today"
        subtitle={`${d.caseCount} active case${d.caseCount === 1 ? "" : "s"} in ${ws.office.name}${d.ordersRecorded ? ` · ${d.ordersRecorded} order${d.ordersRecorded === 1 ? "" : "s"} recorded, about ${d.ordersRecorded * MINUTES_PER_ORDER} minutes of manual diary work saved (assuming ${MINUTES_PER_ORDER} min per order)` : ""}`}
        actions={<>
          <Link href="/cases/new" className="btn-secondary"><Briefcase className="h-4 w-4" aria-hidden /> New case</Link>
          <Link href="/tasks#add" className="btn-secondary"><ListPlus className="h-4 w-4" aria-hidden /> Add task</Link>
          <Link href="/research" className="btn-secondary"><BookOpen className="h-4 w-4" aria-hidden /> Analyse a case</Link>
        </>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Hearings today" value={d.todayHearings.length} href="/calendar?view=agenda" />
        <Stat label="Overdue tasks" value={d.overdue.length} href="/tasks?filter=overdue" tone={d.overdue.length ? "danger" : undefined} />
        <Stat label="Orders awaiting verification" value={d.awaitingReview.length} href="/upload#queue" tone={d.awaitingReview.length ? "warn" : undefined} />
        <Stat label="Tasks due today" value={d.dueToday.length} href="/tasks?filter=today" tone={d.dueToday.length ? "warn" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Today's hearings" action={<Link href="/calendar" className="link text-sm">Calendar</Link>}>
            {d.todayHearings.length ? <ul>{d.todayHearings.map((h) => <span key={h.id}>{row(h.caseId, <><span className="text-muted">{h.purpose}</span><HearingBadge status={h.status} /></>, `/cases/${h.caseId}`)}</span>)}</ul> : <p className="text-sm text-muted">No hearings today.</p>}
          </Card>

          {(d.awaitingReview.length > 0 || d.failedJobs.length > 0) && (
            <Card title="Orders awaiting your review">
              <ul>
                {[...d.awaitingReview, ...d.failedJobs].map((j) => {
                  const docName = ws.documents.find((x) => x.id === j.documentId)?.filename;
                  return (
                    <li key={j.id} className="border-t border-line py-2.5 text-sm first:border-0">
                      <Link href={`/review/${j.id}`} className="flex flex-wrap items-center gap-2 hover:text-navy-800">
                        <span className="font-medium">{j.extraction?.caseNumber.value ?? docName}</span>
                        {j.status === "failed" ? <Badge tone="danger">Could not read — enter manually</Badge> : <Badge tone="warn">Review and confirm</Badge>}
                        {j.match?.kind === "ambiguous" && <Badge tone="warn">Case match unclear</Badge>}
                        <span className="ml-auto inline-flex items-center gap-1 text-navy-800">Open <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card title="Next 7 days">
            {d.weekHearings.length ? (
              <ul>{d.weekHearings.map((h) => <span key={h.id}>{row(h.caseId, <><span className="w-24 text-right tabular-nums">{formatDate(h.date)}</span><HearingBadge status={h.status} /></>, `/cases/${h.caseId}`)}</span>)}</ul>
            ) : <p className="text-sm text-muted">No hearings in the next seven days.</p>}
          </Card>

          <Card title="Tasks: overdue and due today" action={<Link href="/tasks" className="link text-sm">All tasks</Link>}>
            {[...d.overdue, ...d.dueToday].length ? (
              <ul>{[...d.overdue, ...d.dueToday].slice(0, 10).map((t) => <span key={t.id}>{row(t.caseId, <><span className="text-ink">{t.title}</span><DueBadge task={t} today={today} /></>, `/cases/${t.caseId}?tab=tasks`)}</span>)}</ul>
            ) : <p className="text-sm text-muted">Nothing overdue or due today.</p>}
          </Card>
        </div>

        <div className="space-y-4">
          {(d.dateChanges.length > 0 || d.needsReschedule.length > 0) && (
            <Card title={<span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4 text-warn" aria-hidden /> Changed hearing dates</span>}>
              <ul className="space-y-2 text-sm">
                {d.dateChanges.slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <Link href={`/cases/${c.caseId}?tab=orders`} className="hover:text-navy-800">
                      <span className="font-medium">{caseOf(c.caseId)?.number}</span>: {formatDate(c.from)} → <strong>{formatDate(c.to)}</strong>
                    </Link>
                    {!c.reviewed && <div className="mt-1"><Badge tone="warn">{c.affectedTaskIds.length} task(s) to review</Badge></div>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {d.unconfirmedHearings.length > 0 && (
            <Card title="Hearing dates to confirm">
              <ul className="space-y-1.5 text-sm">{d.unconfirmedHearings.map((h) => <li key={h.id}><Link href={`/cases/${h.caseId}?tab=orders`} className="hover:text-navy-800"><span className="font-medium">{caseOf(h.caseId)?.number}</span> · {formatDate(h.date)}</Link></li>)}</ul>
            </Card>
          )}
          {d.repeatedAdjournments.length > 0 && (
            <Card title="Repeated adjournments">
              <ul className="space-y-1.5 text-sm">{d.repeatedAdjournments.map(({ c, n }) => <li key={c.id}><Link href={`/cases/${c.id}?tab=orders`} className="hover:text-navy-800"><span className="font-medium">{c.number}</span> · adjourned {n} times</Link></li>)}</ul>
            </Card>
          )}
          {d.researchToReview.length > 0 && (
            <Card title="Research to review">
              <ul className="space-y-1.5 text-sm">{d.researchToReview.map((r) => <li key={r.id}><Link href={`/research/${r.id}`} className="hover:text-navy-800"><span className="font-medium">{caseOf(r.caseId)?.number}</span> · v{r.versions.length} · {r.versions.at(-1)?.mode === "demo" ? "demo" : "AI"}</Link></li>)}</ul>
            </Card>
          )}
          <Card title="Recent activity">
            {d.recent.length ? (
              <ul className="space-y-2 text-sm">
                {d.recent.map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-700" aria-hidden />
                    <span><span className="font-medium">{a.action.replace(/[._]/g, " ")}</span>{a.caseId && caseOf(a.caseId) ? <> · <Link className="link" href={`/cases/${a.caseId}`}>{caseOf(a.caseId)?.number}</Link></> : null}<span className="block text-xs text-muted">{new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</span></span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No activity yet" />}
          </Card>
        </div>
      </div>
    </>
  );
}
