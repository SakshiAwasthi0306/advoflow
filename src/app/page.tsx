import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, CircleAlert, Clock3, FileWarning, Gavel, PenLine, RotateCcw } from "lucide-react";
import { pageData } from "@/lib/server";
import { dashboard, MINUTES_PER_ORDER } from "@/lib/services/queries";
import { addDays, daysBetween, formatDate, todayIST } from "@/lib/dates";
import { Badge, Card, DateBlock, DemoBadge, Section } from "@/components/ui";
import { HearingBadge } from "@/components/status";
import { ActionButton } from "@/components/client";
import { QuickActions } from "@/components/quick-actions";
import type { AuditEntry, Hearing, Workspace } from "@/lib/types";
import { actionText } from "@/lib/activity";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const n = (k: number, one: string, many = `${one}s`) => `${k === 0 ? "no" : k === 1 ? "one" : k} ${k === 1 ? one : many}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function greeting(name: string) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const first = name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] || "";
  return first ? `${part}, ${first}.` : `${part}.`;
}

const dayLabel = (iso: string, today: string) => {
  const d = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : formatDate(d);
};

function prep(ws: Workspace, h: Hearing) {
  const open = ws.tasks.filter((t) => t.caseId === h.caseId && t.status === "open" && (!t.dueDate || t.dueDate <= h.date));
  return open.length ? { ok: false, text: `${open.length} task${open.length === 1 ? "" : "s"} to finish first` } : { ok: true, text: "Nothing open before this date" };
}

export default async function Today() {
  const { ws, session } = await pageData();
  const d = dashboard(ws);
  const today = todayIST();
  const [y, m, day] = today.split("-").map(Number);
  const dateLine = `${WEEKDAY[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]}, ${day} ${MONTH[m - 1]} ${y}`;
  const caseOf = (id: string) => ws.cases.find((c) => c.id === id);
  const liveCases = ws.cases.filter((c) => c.status === "active").map((c) => ({ id: c.id, number: c.number, title: c.title }));
  const canConfirm = session.role === "owner" || session.role === "advocate";

  if (!ws.cases.length && !ws.jobs.length) {
    return (
      <div className="animate-rise">
        <div className="kicker mb-1.5">{dateLine}</div>
        <h1 className="display text-[34px] font-medium leading-tight">{greeting(session.name)}</h1>
        <p className="mt-2 max-w-xl text-muted">Your diary is empty for now. Start with one case or one court order. AdvoFlow will keep track of the dates, tasks and client updates that follow.</p>
        <div className="mt-7"><QuickActions cases={liveCases} canConfirm={canConfirm} today={today} /></div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card title="Bring in an order">
            <p className="mb-4 text-sm text-muted">Upload or paste a court order. AdvoFlow drafts the case details, dates and directions; you confirm each one before anything is saved.</p>
            <Link href="/upload" className="btn-primary">Record a court order <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </Card>
          <Card title="Or look around with sample data">
            <p className="mb-4 text-sm text-muted">Three <strong>fictional</strong> cases with orders, hearings, a date change, tasks and client drafts. Everything is labelled Demo and can be removed in Settings.</p>
            {session.role === "owner" ? <ActionButton url="/api/demo" body={{ action: "load" }} className="btn-secondary" success="Demo workspace loaded">Load the demo workspace</ActionButton> : <p className="text-sm text-muted">Ask the office owner to load the demo.</p>}
          </Card>
        </div>
      </div>
    );
  }

  const upcoming = ws.hearings
    .filter((h) => (h.status === "confirmed" || h.status === "awaiting_verification") && h.date > today && caseOf(h.caseId)?.status === "active")
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const toReview = [...d.awaitingReview, ...d.failedJobs];

  // One honest sentence about the day.
  const bits: string[] = [];
  bits.push(d.todayHearings.length ? `${cap(n(d.todayHearings.length, "hearing"))} today` : "No hearings today");
  if (d.overdue.length) bits.push(`${n(d.overdue.length, "overdue task")}`);
  if (toReview.length) bits.push(`${n(toReview.length, "order")} waiting for your review`);
  if (d.dueToday.length) bits.push(`${n(d.dueToday.length, "task")} due today`);
  const summary = bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits.at(-1)}.` : `${bits[0]}.`;

  // The week ahead, from real hearings and deadlines.
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const hs = ws.hearings.filter((h) => h.date === date && (h.status === "confirmed" || h.status === "awaiting_verification") && caseOf(h.caseId)?.status === "active");
    const ts = ws.tasks.filter((t) => t.dueDate === date && t.status === "open" && caseOf(t.caseId)?.status === "active");
    return { date, hearings: hs.length, tasks: ts.length };
  });

  type Item = { key: string; href: string; icon: typeof AlertTriangle; tone: "danger" | "accent" | "ai" | "neutral"; title: string; meta: string; ai?: boolean };
  const attention: Item[] = [
    ...d.overdue.map((t) => ({ key: t.id, href: `/cases/${t.caseId}?tab=tasks`, icon: CircleAlert, tone: "danger" as const, title: t.title, meta: `${caseOf(t.caseId)?.number ?? ""} · overdue since ${formatDate(t.dueDate!)}` })),
    ...d.awaitingReview.map((j) => ({ key: j.id, href: `/review/${j.id}`, icon: PenLine, tone: "ai" as const, ai: true, title: `Check the drafted order${j.extraction?.caseNumber.value ? ` for ${j.extraction.caseNumber.value}` : ""}`, meta: j.match?.kind === "ambiguous" ? "Case match unclear — choose the case" : "Nothing is saved until you confirm" })),
    ...d.failedJobs.map((j) => ({ key: j.id, href: `/review/${j.id}`, icon: FileWarning, tone: "accent" as const, title: "An order could not be read", meta: ws.documents.find((x) => x.id === j.documentId)?.filename ?? "Enter the details by hand" })),
    ...d.needsReschedule.map((t) => ({ key: `r${t.id}`, href: `/cases/${t.caseId}?tab=tasks`, icon: RotateCcw, tone: "accent" as const, title: `Hearing moved: does “${t.title}” move too?`, meta: `${formatDate(t.needsReschedule!.from)} → ${formatDate(t.needsReschedule!.to)}` })),
    ...d.unconfirmedHearings.map((h) => ({ key: `h${h.id}`, href: `/cases/${h.caseId}?tab=orders`, icon: CalendarClock, tone: "neutral" as const, title: `Confirm the hearing date for ${caseOf(h.caseId)?.number ?? "a case"}`, meta: `${formatDate(h.date)} · awaiting verification` })),
    ...d.dueToday.map((t) => ({ key: `t${t.id}`, href: `/cases/${t.caseId}?tab=tasks`, icon: Clock3, tone: "accent" as const, title: t.title, meta: `${caseOf(t.caseId)?.number ?? ""} · due today` })),
  ];
  const toneCls = { danger: "text-danger bg-danger-soft", accent: "text-accent bg-accent-soft", ai: "text-ai bg-ai-soft", neutral: "text-neutral bg-neutral-soft" };

  const recent = d.recent.slice(0, 8);
  const recentGroups = recent.reduce<{ label: string; items: AuditEntry[] }[]>((g, a) => {
    const label = dayLabel(a.at, today);
    const last = g.at(-1);
    if (last?.label === label) last.items.push(a); else g.push({ label, items: [a] });
    return g;
  }, []);

  const HearingRow = ({ h }: { h: Hearing }) => {
    const c = caseOf(h.caseId);
    const p = prep(ws, h);
    return (
      <li>
        <Link href={`/cases/${h.caseId}`} className="group grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg px-3 py-3 transition-colors hover:bg-navy-50/60 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2"><span className="ref font-medium text-navy-900">{c?.number}</span>{c?.isDemo && <DemoBadge />}</span>
            <span className="mt-0.5 block truncate text-sm text-ink/80">{c?.title || "Parties not entered"}</span>
            <span className="mt-0.5 block truncate text-xs text-muted">{c?.court || "Court not entered"}{h.purpose ? ` · ${h.purpose}` : ""}</span>
          </span>
          <span className="hidden self-center text-xs sm:block"><span className={`inline-flex items-center gap-1 ${p.ok ? "text-ok" : "text-accent"}`}>{p.ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Clock3 className="h-3.5 w-3.5" aria-hidden />}{p.text}</span></span>
          <span className="self-center"><HearingBadge status={h.status} /></span>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-9">
      {/* Greeting */}
      <header className="animate-rise flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="kicker mb-1.5">{dateLine} · {ws.office.name}</div>
          <h1 className="display text-[34px] font-medium leading-[1.1] sm:text-[40px]">{greeting(session.name)}</h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted">{summary}</p>
        </div>
      </header>

      <div className="animate-rise rise-1"><QuickActions cases={liveCases} canConfirm={canConfirm} today={today} /></div>

      <div className="grid gap-9 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-9">
          {/* Today in court */}
          <Section title={<span className="inline-flex items-center gap-1.5"><Gavel className="h-3.5 w-3.5" aria-hidden /> In court today</span>} action={<Link href="/calendar" className="link text-xs">All hearings</Link>} className="animate-rise rise-2">
            {d.todayHearings.length ? (
              <ul className="-mx-3 divide-y divide-line/70">{d.todayHearings.map((h) => <HearingRow key={h.id} h={h} />)}</ul>
            ) : (
              <p className="py-3 text-sm text-muted">No hearings listed for today{next ? "." : ", and none coming up."}</p>
            )}
          </Section>

          {/* Next hearing spotlight */}
          {next && (() => {
            const c = caseOf(next.caseId);
            const p = prep(ws, next);
            const inDays = daysBetween(today, next.date);
            return (
              <section aria-labelledby="next-hearing" className="card-raised animate-rise rise-2 relative overflow-hidden p-5 sm:p-6">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-navy-900" />
                <div className="kicker mb-3" id="next-hearing">Next hearing · {inDays === 1 ? "tomorrow" : `in ${inDays} days`}</div>
                <div className="flex gap-4 sm:gap-5">
                  <DateBlock date={next.date} size="lg" tone={inDays <= 1 ? "today" : "neutral"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="ref text-[17px] font-medium text-navy-900">{c?.number}</span>{c?.isDemo && <DemoBadge />}<HearingBadge status={next.status} /></div>
                    <div className="display mt-1 text-xl font-medium leading-snug">{c?.title || "Parties not entered"}</div>
                    <div className="mt-1 text-sm text-muted">{c?.court || "Court not entered"}{next.purpose ? ` · for ${next.purpose.toLowerCase()}` : ""}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <span className={`inline-flex items-center gap-1.5 ${p.ok ? "text-ok" : "text-accent"}`}>{p.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Clock3 className="h-4 w-4" aria-hidden />}{p.text}</span>
                      <Link href={`/cases/${next.caseId}`} className="link inline-flex items-center gap-1">Open the case <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* The week */}
          <Section title="The week ahead" action={<Link href="/calendar" className="link text-xs">Calendar</Link>} className="animate-rise rise-3">
            <ol className="grid grid-cols-7 gap-1.5 pt-1">
              {week.map((w, i) => {
                const [, mm, dd] = w.date.split("-").map(Number);
                const wd = WEEKDAY[new Date(Date.UTC(Number(w.date.slice(0, 4)), mm - 1, dd)).getUTCDay()].slice(0, 3);
                const label = `${i === 0 ? "Today" : wd} ${dd}: ${w.hearings} hearing${w.hearings === 1 ? "" : "s"}, ${w.tasks} task${w.tasks === 1 ? "" : "s"} due`;
                return (
                  <li key={w.date} aria-label={label} className={`flex flex-col items-center rounded-lg border px-1 py-2.5 text-center ${i === 0 ? "border-accent/40 bg-accent-soft/60" : "border-line bg-surface"}`}>
                    <span className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${i === 0 ? "text-accent" : "text-muted"}`}>{i === 0 ? "Today" : wd}</span>
                    <span className="display num mt-0.5 text-xl font-medium">{dd}</span>
                    <span className="mt-1.5 flex h-2 items-center gap-1" aria-hidden>
                      {Array.from({ length: Math.min(w.hearings, 3) }, (_, k) => <span key={`h${k}`} className="h-1.5 w-1.5 rounded-full bg-navy-900" />)}
                      {Array.from({ length: Math.min(w.tasks, 3) }, (_, k) => <span key={`t${k}`} className="h-1.5 w-1.5 rounded-full border border-accent" />)}
                    </span>
                    <span className="mt-1 hidden text-[11px] text-muted sm:block">{w.hearings || w.tasks ? `${w.hearings ? `${w.hearings}h` : ""}${w.hearings && w.tasks ? " · " : ""}${w.tasks ? `${w.tasks}t` : ""}` : "—"}</span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 flex flex-wrap gap-x-4 text-[11.5px] text-muted"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-navy-900" aria-hidden />hearing (h)</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full border border-accent" aria-hidden />task due (t)</span></p>
            {upcoming.length > 1 && (
              <ul className="mt-4 divide-y divide-line/70">
                {upcoming.slice(1, 5).map((h) => {
                  const c = caseOf(h.caseId);
                  return (
                    <li key={h.id}><Link href={`/cases/${h.caseId}`} className="flex items-center gap-3 py-2 text-sm hover:text-navy-800">
                      <span className="num w-[86px] shrink-0 text-muted">{formatDate(h.date)}</span>
                      <span className="ref shrink-0 font-medium">{c?.number}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">{c?.title}</span>
                      {h.status === "awaiting_verification" && <Badge tone="neutral">To confirm</Badge>}
                    </Link></li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <div className="min-w-0 space-y-9">
          {/* Attention */}
          <Section title={<>Needs your attention{attention.length ? <span className="num ml-1.5 rounded bg-accent px-1.5 py-px text-[10px] text-surface">{attention.length}</span> : null}</>} className="animate-rise rise-2">
            {attention.length ? (
              <ul className="space-y-1.5 pt-1">
                {attention.slice(0, 9).map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className={`group flex gap-3 rounded-lg border px-3 py-2.5 transition-colors ${a.ai ? "ai-draft hover:border-ai" : a.tone === "danger" ? "border-danger-line bg-danger-soft/40 hover:bg-danger-soft" : "border-line bg-surface hover:border-navy-700/30"}`}>
                      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ${toneCls[a.tone]}`}><a.icon className="h-4 w-4" aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-snug">{a.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">{a.ai && <span className="mr-1 text-ai">AI draft ·</span>}{a.meta}</span>
                      </span>
                      <ArrowRight className="mt-1.5 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
                {attention.length > 9 && <li className="px-1 pt-1 text-xs text-muted">and {attention.length - 9} more — see the bell at the top.</li>}
              </ul>
            ) : (
              <div className="flex items-center gap-3 py-4 text-sm text-muted"><CheckCircle2 className="h-5 w-5 text-ok" aria-hidden />All clear. Nothing is waiting on you.</div>
            )}
          </Section>

          {(d.repeatedAdjournments.length > 0 || d.researchToReview.length > 0) && (
            <Section title="Worth a look" className="animate-rise rise-3">
              <ul className="space-y-2 pt-1 text-sm">
                {d.repeatedAdjournments.slice(0, 4).map(({ c, n: k }) => <li key={c.id}><Link href={`/cases/${c.id}?tab=orders`} className="hover:text-navy-800"><span className="ref font-medium">{c.number}</span> <span className="text-muted">has been adjourned {k} times</span></Link></li>)}
                {d.researchToReview.slice(0, 3).map((r) => <li key={r.id}><Link href={`/research/${r.id}`} className="hover:text-navy-800"><span className="ref font-medium">{caseOf(r.caseId)?.number}</span> <span className="text-muted">· research ready to review</span></Link></li>)}
              </ul>
            </Section>
          )}

          {/* Activity */}
          <Section title="Recent activity" className="animate-rise rise-4">
            {recentGroups.length ? (
              <div className="space-y-4 pt-1">
                {recentGroups.map((g) => (
                  <div key={g.label}>
                    <div className="mb-1.5 text-xs font-medium text-muted">{g.label}</div>
                    <ol className="relative ml-[5px] space-y-3 border-l border-line pl-4">
                      {g.items.map((a) => (
                        <li key={a.id} className="relative text-sm">
                          <span aria-hidden className={`absolute -left-[21px] top-[7px] h-[9px] w-[9px] rounded-full border-2 border-paper ${a.action.startsWith("order") ? "bg-navy-900" : a.action.startsWith("hearing") ? "bg-accent" : a.action.includes("ai") ? "bg-ai" : "bg-muted/60"}`} />
                          <span className="font-medium">{actionText(a)}</span>
                          {a.caseId && caseOf(a.caseId) ? <> · <Link className="ref text-navy-800 hover:underline" href={`/cases/${a.caseId}`}>{caseOf(a.caseId)?.number}</Link></> : null}
                          <span className="num block text-xs text-muted">{new Date(a.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ) : <p className="py-3 text-sm text-muted">Nothing yet. Activity appears here as you work.</p>}
          </Section>
        </div>
      </div>

      <p className="text-xs text-muted">
        {d.caseCount} active case{d.caseCount === 1 ? "" : "s"}
        {d.ordersRecorded ? ` · ${d.ordersRecorded} order${d.ordersRecorded === 1 ? "" : "s"} recorded (roughly ${d.ordersRecorded * MINUTES_PER_ORDER} minutes of diary writing, at ${MINUTES_PER_ORDER} minutes an order)` : ""}
      </p>
    </div>
  );
}
