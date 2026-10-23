import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, FileText, Pencil, Upload } from "lucide-react";
import { pageData } from "@/lib/server";
import { caseSummary } from "@/lib/services/queries";
import { formatDate, todayIST } from "@/lib/dates";
import { AIBadge, Badge, Card, DateBlock, DemoBadge, EmptyState, KeyVal, Notice, Tabs } from "@/components/ui";
import { AddHearing } from "@/components/quick-actions";
import { CaseTimeline } from "@/components/case-timeline";
import { actionText } from "@/lib/activity";
import { DueBadge, HearingBadge, JobBadge } from "@/components/status";
import { ActionButton } from "@/components/client";
import { AIClientDraft } from "@/components/ai-client-draft";
import { languageLabel } from "@/lib/languages";
import { usesAIService } from "@/lib/config";
import { AddTaskForm, ClientUpdateEditor, HearingConfirm, LinkClient, RescheduleActions, ResearchStart, TaskEdit, TaskToggle } from "@/components/widgets";

export default async function CaseWorkspace({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const { ws, session } = await pageData();
  const c = ws.cases.find((x) => x.id === params.id);
  if (!c) notFound();
  const today = todayIST();
  const tab = searchParams.tab ?? "overview";
  const aiReady = usesAIService();
  const s = caseSummary(ws, c, today);
  const orders = ws.orders.filter((o) => o.caseId === c.id).sort((a, b) => (b.orderDate ?? "").localeCompare(a.orderDate ?? "") || b.approvedAt.localeCompare(a.approvedAt));
  const hearings = ws.hearings.filter((h) => h.caseId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const tasks = ws.tasks.filter((t) => t.caseId === c.id).sort((a, b) => (a.status === b.status ? (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") : a.status === "open" ? -1 : 1));
  const docs = ws.documents.filter((d) => d.caseId === c.id || ws.jobs.some((j) => j.documentId === d.id && j.match?.caseId === c.id));
  const pendingJobs = ws.jobs.filter((j) => j.status === "needs_review" && j.match?.caseId === c.id);
  const changes = ws.dateChanges.filter((d) => d.caseId === c.id).sort((a, b) => b.at.localeCompare(a.at));
  const reports = ws.research.filter((r) => r.caseId === c.id);
  const updates = ws.clientUpdates.filter((u) => u.caseId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const client = ws.clients.find((x) => x.id === c.clientId) ?? null;
  const activity = ws.audit.filter((a) => a.caseId === c.id).sort((a, b) => b.at.localeCompare(a.at));
  const base = `/cases/${c.id}?tab=`;
  const orderLabel = (id: string) => { const o = ws.orders.find((x) => x.id === id); return o ? `Order of ${formatDate(o.orderDate)}` : "order"; };

  return (
    <>
      <header className="mb-6 animate-rise">
        <Link href="/cases" className="kicker inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="h-3 w-3" aria-hidden /> Case diary</Link>
        <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="ref text-[22px] font-medium text-navy-900 sm:text-[26px]">{c.number}</h1>
              {c.isDemo && <DemoBadge />}
              {c.status !== "active" && <Badge tone="neutral">{c.status === "closed" ? "Closed" : "Archived"}</Badge>}
              {c.cnr && <span className="ref rounded border border-line bg-surface px-1.5 py-0.5 text-[11.5px] text-muted" title="eCourts CNR">CNR {c.cnr}</span>}
            </div>
            <p className="display mt-1.5 text-[24px] font-medium leading-snug sm:text-[28px]">{c.title || <span className="text-muted">Parties not entered</span>}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span>{c.court || "Court not entered"}</span>
              {c.caseType && <span>{c.caseType}</span>}
              {c.stage && <span>Stage: <span className="text-ink/80">{c.stage}</span></span>}
              {client && <span>Client: <span className="text-ink/80">{client.name}</span></span>}
            </div>
          </div>
          <div className="theme-feature flex items-center gap-4 rounded-xl p-4 shadow-glow lg:min-w-[320px]">
            {s.hearing ? <DateBlock date={s.hearing.date} tone={s.hearing.date === today ? "today" : s.hearing.date < today ? "overdue" : "neutral"} /> : <div className="grid h-[58px] w-[52px] place-items-center rounded-lg border border-dashed border-line text-[10px] uppercase tracking-[0.08em] text-muted">No date</div>}
            <div className="min-w-0 flex-1 text-sm">
              <div className="kicker">Next hearing</div>
              {s.hearing ? <>
                <div className="mt-0.5 font-medium">{s.hearing.date === today ? "Today" : s.hearing.date < today ? `Was ${formatDate(s.hearing.date)}` : `${formatDate(s.hearing.date)}`}{s.hearing.purpose ? <span className="font-normal text-muted"> · {s.hearing.purpose}</span> : null}</div>
                <div className="mt-1"><HearingBadge status={s.hearing.status} /></div>
              </> : <div className="mt-0.5 text-muted">None recorded</div>}
            </div>
            {c.status === "active" && <AddHearing cases={[{ id: c.id, number: c.number, title: c.title }]} caseId={c.id} canConfirm={session.role === "owner" || session.role === "advocate"} today={today} triggerClass="btn-secondary btn-sm" />}
          </div>
        </div>
        <div className="no-print mt-4 flex flex-wrap gap-2">
          <Link href={`/upload?case=${encodeURIComponent(c.number)}`} className="btn-primary"><Upload className="h-4 w-4" aria-hidden /> Record an order</Link>
          <Link href={`/cases/${c.id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" aria-hidden /> Edit details</Link>
          {c.status === "active"
            ? <ActionButton url={`/api/cases/${c.id}/status`} body={{ status: "closed" }} className="btn-ghost" confirmText="Click again to close" success="Case closed">Close case</ActionButton>
            : <ActionButton url={`/api/cases/${c.id}/status`} body={{ status: "active" }} className="btn-secondary" success="Case reopened">Reopen</ActionButton>}
          {c.status !== "archived" && <ActionButton url={`/api/cases/${c.id}/status`} body={{ status: "archived" }} className="btn-ghost" confirmText="Click again to archive" success="Case archived">Archive</ActionButton>}
        </div>
      </header>
      <CaseTimeline c={c} orders={orders} hearings={hearings} changes={changes} nextHearing={s.hearing} today={today} />
      {pendingJobs.length > 0 && <div className="ai-draft mb-5 flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><AIBadge>Order drafted · waiting for you</AIBadge><span className="text-ink/80">Nothing from it is saved to this case until you check and confirm it.</span>{pendingJobs.map((j) => <Link key={j.id} href={`/review/${j.id}`} className="link ml-auto font-medium">Check the draft →</Link>)}</div>}
      <Tabs active={tab} tabs={[
        { key: "overview", label: "Overview", href: base + "overview" },
        { key: "orders", label: "Orders & timeline", href: base + "orders", count: orders.length },
        { key: "research", label: "Research", href: base + "research", count: reports.length },
        { key: "tasks", label: "Tasks", href: base + "tasks", count: s.openTasks },
        { key: "documents", label: "Documents", href: base + "documents", count: docs.length },
        { key: "client", label: "Client updates", href: base + "client" },
      ]} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Case details" className="lg:col-span-2">
            <dl>
              <KeyVal k="Case number"><span className="ref">{c.number}</span>{c.cnr ? <span className="text-muted"> · CNR {c.cnr}</span> : null}</KeyVal>
              <KeyVal k="Parties">{c.parties.petitioner || "—"} <span className="text-muted">v.</span> {c.parties.respondent || "—"}</KeyVal>
              <KeyVal k="Court">{c.court || "—"}</KeyVal>
              <KeyVal k="Case type">{c.caseType || "—"}</KeyVal>
              <KeyVal k="Current stage">{c.stage || "—"}</KeyVal>
              <KeyVal k="Next hearing">{s.hearing ? <span className="flex flex-wrap items-center gap-2">{formatDate(s.hearing.date)} <HearingBadge status={s.hearing.status} /></span> : "No hearing date recorded"}</KeyVal>
              <KeyVal k="Pending tasks">{s.openTasks}{s.overdue ? <> · <Badge tone="danger">{s.overdue} overdue</Badge></> : null}</KeyVal>
              <KeyVal k="Adjournments">{s.adjournments}</KeyVal>
              <KeyVal k="Client"><LinkClient caseId={c.id} current={c.clientId} clients={ws.clients.map((x) => ({ id: x.id, name: x.name }))} /></KeyVal>
              <KeyVal k="Research">{s.researchStatus ? <Badge tone={s.researchStatus === "reviewed" ? "ok" : "warn"}>{s.researchStatus === "reviewed" ? "Reviewed" : "Report needs review"}</Badge> : "No research yet"}</KeyVal>
            </dl>
          </Card>
          <div className="space-y-4">
            <Card title="Latest order">
              {s.latestOrder ? (
                <div className="text-sm">
                  <div className="font-medium">{formatDate(s.latestOrder.orderDate)}{s.latestOrder.stage ? ` · ${s.latestOrder.stage}` : ""}</div>
                  <p className="mt-1 text-muted">{s.latestOrder.summary || "No summary approved."}</p>
                  <Link href={base + "orders"} className="link mt-2 inline-block">Timeline →</Link>
                </div>
              ) : <p className="text-sm text-muted">No approved orders yet.</p>}
            </Card>
            <Card title="Recent activity">
              {activity.length ? <ul className="space-y-1.5 text-sm">{activity.slice(0, 6).map((a) => <li key={a.id}><span className="font-medium">{actionText(a)}</span><span className="block text-xs text-muted">{new Date(a.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</span></li>)}</ul> : <p className="text-sm text-muted">Nothing yet.</p>}
            </Card>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-4">
          {hearings.filter((h) => h.status === "awaiting_verification").map((h) => (
            <Notice key={h.id} title={`Hearing on ${formatDate(h.date)} is awaiting your verification`}>
              <p className="mb-2">It came from an approved order but the date itself was not confirmed. Check it against the original order, correct it if needed, then confirm.</p>
              <HearingConfirm key={`${h.id}:${h.date}`} id={h.id} date={h.date} />
            </Notice>
          ))}
          {changes.length > 0 && (
            <Card title="Hearing date changes">
              <ul className="space-y-2 text-sm">{changes.map((ch) => (
                <li key={ch.id} className="flex flex-wrap items-center gap-2">
                  <span>{formatDate(ch.from)} → <strong>{formatDate(ch.to)}</strong></span>
                  {ch.orderId && <span className="text-muted">by {orderLabel(ch.orderId)}</span>}
                  {ch.reviewed ? <Badge tone="ok">Tasks reviewed</Badge> : <Link href={base + "tasks"}><Badge tone="warn">{ch.affectedTaskIds.length} task(s) to review</Badge></Link>}
                </li>
              ))}</ul>
            </Card>
          )}
          {orders.length === 0 ? <EmptyState title="No approved orders yet" body="Upload an order; after you review and confirm it, it appears here." action={<Link href={`/upload?case=${encodeURIComponent(c.number)}`} className="btn-primary">Upload an order</Link>} /> : (
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {orders.map((o, i) => {
                const doc = ws.documents.find((d) => d.id === o.documentId);
                const nextH = ws.hearings.find((h) => h.sourceOrderId === o.id);
                const oTasks = ws.tasks.filter((t) => t.sourceOrderId === o.id);
                const oReports = reports.filter((r) => r.versions.some((v) => v.orderIds.includes(o.id)));
                return (
                  <li key={o.id} className="relative">
                    <span aria-hidden className={`absolute -left-[27px] top-5 h-3 w-3 rounded-full border-2 border-surface ${i === 0 ? "bg-navy-900" : "bg-line"}`} />
                    <article className={`card p-4 ${i === 0 ? "border-navy-700/40" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{o.orderDate ? `Order of ${formatDate(o.orderDate)}` : "Order (date not recorded)"}</h3>
                        {i === 0 && <Badge tone="navy" icon={false}>Latest</Badge>}
                        <Badge tone="ok">Approved by advocate</Badge>
                        {o.isDemo && <DemoBadge />}
                      </div>
                      <p className="mt-2 text-sm">{o.summary || <span className="text-muted">No summary approved.</span>}</p>
                      <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
                        <KeyVal k="Stage">{o.stage || "—"}</KeyVal>
                        <KeyVal k="Adjourned">{o.adjourned ? "Yes" : "No"}</KeyVal>
                        <KeyVal k="Costs">{o.costs || "None stated"}</KeyVal>
                        <KeyVal k="Next hearing">{o.nextHearingDate ? <span className="flex flex-wrap items-center gap-1">{formatDate(o.nextHearingDate)}{nextH && <HearingBadge status={nextH.status} />}</span> : "Not stated"}</KeyVal>
                      </dl>
                      {o.directions.length > 0 && <div className="mt-2 text-sm"><div className="font-medium">Directions (as stated in the order)</div><ul className="ml-5 list-disc text-muted">{o.directions.map((d, j) => <li key={j}>{d}</li>)}</ul></div>}
                      {oTasks.length > 0 && <div className="mt-2 text-sm"><span className="font-medium">Tasks: </span>{oTasks.map((t) => t.title).join(" · ")}</div>}
                      {o.extractionSnapshot && <details className="mt-2 text-sm"><summary className="cursor-pointer text-navy-800">What was extracted vs. approved</summary>
                        <p className="mt-1 text-muted">Extractor: {o.extractionSnapshot.extractor === "anthropic" ? `Claude (${o.extractionSnapshot.model})` : o.extractionSnapshot.extractor === "case-diary-import" ? "imported from the Case Diary prototype" : "rule-based demo extractor"}. Approved fields: {o.approvedFields.join(", ") || "none"}.</p>
                        {o.extractionSnapshot.warnings.length > 0 && <ul className="ml-5 list-disc text-warn">{o.extractionSnapshot.warnings.map((w, j) => <li key={j}>{w}</li>)}</ul>}
                      </details>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {doc && <a className="btn-secondary btn-sm" href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer"><FileText className="h-3.5 w-3.5" aria-hidden /> Original order</a>}
                        <Link className="btn-secondary btn-sm" href={`/research/new?case=${c.id}&order=${o.id}`}><BookOpen className="h-3.5 w-3.5" aria-hidden /> Analyse this order</Link>
                        {oReports.map((r) => <Link key={r.id} className="btn-ghost btn-sm" href={`/research/${r.id}`}>Research v{r.versions.length}</Link>)}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
          {hearings.length > 0 && (
            <Card title="Hearing history">
              <ul className="divide-y divide-line text-sm">{hearings.map((h) => <li key={h.id} className="flex flex-wrap items-center gap-2 py-2"><span className="w-28 tabular-nums">{formatDate(h.date)}</span><HearingBadge status={h.status} /><span className="text-muted">{h.purpose}</span></li>)}</ul>
            </Card>
          )}
        </div>
      )}

      {tab === "research" && (
        <div className="space-y-4">
          {reports.map((r) => {
            const v = r.versions.at(-1)!;
            return (
              <Card key={r.id} title={r.title} action={<Link href={`/research/${r.id}`} className="btn-secondary btn-sm">Open report</Link>}>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge tone={v.status === "reviewed" ? "ok" : "warn"}>{v.status === "reviewed" ? "Reviewed" : "Needs review"}</Badge>
                  {v.mode === "demo" ? <Badge tone="demo">Demo — fictional sources</Badge> : v.mode === "partial" ? <Badge tone="neutral">AI analysis, no live legal source</Badge> : <Badge tone="navy">Live source</Badge>}
                  <span className="text-muted">v{v.version} · {new Date(v.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} · {v.authorities.length} authorities · based on {v.orderIds.length} order(s)</span>
                </div>
                <p className="mt-2 text-sm text-muted">{v.summary}</p>
              </Card>
            );
          })}
          <Card title={reports.length ? "Start new research" : "Start legal research"}>
            <ResearchStart caseId={c.id} orders={orders.map((o) => ({ id: o.id, label: `Order of ${formatDate(o.orderDate)}${o.stage ? ` · ${o.stage}` : ""}` }))} docs={docs.filter((d) => !orders.some((o) => o.documentId === d.id)).map((d) => ({ id: d.id, label: d.filename }))} />
          </Card>
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-4">
          <Card title="Add a task"><AddTaskForm cases={[{ id: c.id, number: c.number }]} fixedCaseId={c.id} /></Card>
          <Card title="Tasks">
            {tasks.length ? (
              <ul className="divide-y divide-line">
                {tasks.map((t) => (
                  <li key={t.id} className="flex gap-3 py-3">
                    <TaskToggle key={t.id} id={t.id} done={t.status === "done"} title={t.title} />
                    <div className="min-w-0 flex-1">
                      <div className={t.status === "done" ? "text-muted line-through" : "font-medium"}>{t.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <DueBadge task={t} today={today} />
                        {t.dueDate && <span>{formatDate(t.dueDate)}</span>}
                        {t.priority === "high" && t.status === "open" && <Badge tone="danger" icon={false}>High priority</Badge>}
                        <span>{t.source === "order" ? `From ${t.sourceOrderId ? orderLabel(t.sourceOrderId) : "an order"}` : t.source === "research" ? "From research (confirmed by you)" : "Added manually"}</span>
                        {t.completedAt && <span>Completed {formatDate(t.completedAt.slice(0, 10))}</span>}
                      </div>
                      {t.needsReschedule && t.status === "open" && (
                        <div className="mt-2 rounded-lg border border-warn-line bg-warn-soft p-2 text-sm">
                          <div className="mb-1 font-medium text-warn">The hearing moved from {formatDate(t.needsReschedule.from)} to {formatDate(t.needsReschedule.to)}. Should this task move too?</div>
                          <RescheduleActions key={t.id} id={t.id} from={t.needsReschedule.from} to={t.needsReschedule.to} />
                        </div>
                      )}
                      {t.status === "open" && <TaskEdit key={`${t.id}:${t.title}:${t.dueDate}:${t.priority}`} id={t.id} title={t.title} dueDate={t.dueDate} priority={t.priority} />}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No tasks for this case" />}
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <Card title="Documents" action={<Link href={`/upload?case=${encodeURIComponent(c.number)}`} className="btn-secondary btn-sm">Upload</Link>}>
          {docs.length ? (
            <ul className="divide-y divide-line text-sm">
              {docs.map((d) => {
                const job = ws.jobs.find((j) => j.documentId === d.id);
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <FileText className="h-4 w-4 text-muted" aria-hidden />
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="link font-medium">{d.filename}</a>
                    {d.isDemo && <DemoBadge />}
                    <span className="text-muted">{(d.size / 1024).toFixed(1)} KB · {d.textSource.replace("_", " ")} · {formatDate(d.createdAt.slice(0, 10))}</span>
                    {job && <span className="ml-auto"><Link href={`/review/${job.id}`}><JobBadge status={job.status} /></Link></span>}
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title="No documents yet" />}
        </Card>
      )}

      {tab === "client" && (
        <div className="space-y-4">
          <Card title="Client">
            {client ? <p className="text-sm"><span className="font-medium">{client.name}</span> · {client.phone ?? "no phone"} · prefers {languageLabel(client.preferredLanguage)} by {client.preferredChannel}</p> : <p className="text-sm text-muted">No client linked. Link one on the Overview tab so messages can be addressed and sent to the right number.</p>}
          </Card>
          <Notice tone="neutral">Drafts are built only from approved order details and never include legal analysis. Nothing is sent automatically: “Open in WhatsApp” only opens a chat with the text filled in, and does not confirm delivery. English and Kannada drafts use fixed wording; drafts in other languages are written by the AI and come with an English check. Have a speaker of the language check any draft before sending.</Notice>
          <Card title="Draft in another language">
            <AIClientDraft caseId={c.id} defaultLang={client?.preferredLanguage ?? "en"} aiReady={aiReady} hasOrder={ws.orders.some((o) => o.caseId === c.id)} />
          </Card>
          {updates.length ? updates.map((u) => (
            <Card key={u.id} title={<span className="flex flex-wrap items-center gap-2">{languageLabel(u.lang)}{u.origin === "ai" && <AIBadge>AI draft · check before sending</AIBadge>} <span className="text-xs font-normal text-muted">{u.sourceOrderId ? orderLabel(u.sourceOrderId) : ""}</span>{u.status === "handed_off" ? <Badge tone="navy">Opened in WhatsApp</Badge> : <Badge tone="neutral">Draft</Badge>}</span>}>
              <ClientUpdateEditor key={`${u.id}:${u.updatedAt}`} id={u.id} text={u.text} lang={u.lang} status={u.status} phone={client?.phone ?? null} waLinkBase="https://wa.me/" />
              {u.checkText && <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted">What this says in English</summary><p className="mt-1 rounded-lg bg-paper p-2">{u.checkText}</p></details>}
            </Card>
          )) : <EmptyState title="No client updates yet" body="An English draft (and Kannada, when the client prefers it) is created each time you approve an order. Use “Draft in another language” for any other language." />}
        </div>
      )}
      <p className="mt-8 text-xs text-muted">Signed in as {session.name} ({session.role}).</p>
    </>
  );
}
