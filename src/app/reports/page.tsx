import Link from "next/link";
import { pageData } from "@/lib/server";
import { caseSummary, dashboard } from "@/lib/services/queries";
import { addDays, formatDate, todayIST } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { HearingRiver, PulseTiles, RankBars, StageDonut, type RiverDay, type Tile } from "@/components/report-visuals";
import { PrintButton } from "@/components/research-widgets";

export const metadata = { title: "Reports" };

export default async function Reports() {
  const { ws } = await pageData();
  const today = todayIST();
  const d = dashboard(ws, today);
  const live = ws.cases.filter((c) => c.status === "active");
  const num = (id: string) => ws.cases.find((c) => c.id === id)?.number ?? "";
  const upcoming = ws.hearings.filter((h) => live.some((c) => c.id === h.caseId) && h.date >= today && h.date <= addDays(today, 30) && (h.status === "confirmed" || h.status === "awaiting_verification")).sort((a, b) => a.date.localeCompare(b.date));
  const open = ws.tasks.filter((t) => t.status === "open" && live.some((c) => c.id === t.caseId));
  const byStage = new Map<string, number>();
  for (const c of live) byStage.set(c.stage || "Not recorded", (byStage.get(c.stage || "Not recorded") ?? 0) + 1);
  const adj = live.map((c) => ({ c, s: caseSummary(ws, c, today) })).sort((a, b) => b.s.adjournments - a.s.adjournments);
  const workload = live.map((c) => ({ c, n: open.filter((t) => t.caseId === c.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const allLiveTasks = ws.tasks.filter((t) => live.some((c) => c.id === t.caseId));
  const tiles: Tile[] = [
    { key: "cases", label: "Active cases", value: live.length, ratio: ws.cases.length ? live.length / ws.cases.length : 0, note: `of ${ws.cases.length} on record`, href: "/cases" },
    { key: "hearings", label: "Hearings in next 30 days", value: upcoming.length, ratio: upcoming.length ? upcoming.filter((h) => h.status === "confirmed").length / upcoming.length : 0, note: `${upcoming.filter((h) => h.status === "confirmed").length} confirmed`, href: "/calendar" },
    { key: "tasks", label: "Open tasks", value: open.length, ratio: allLiveTasks.length ? 1 - open.length / allLiveTasks.length : 0, note: `${allLiveTasks.length ? Math.round((1 - open.length / allLiveTasks.length) * 100) : 0}% of tasks done`, href: "/tasks" },
    { key: "overdue", label: "Overdue tasks", value: d.overdue.length, ratio: open.length ? d.overdue.length / open.length : 0, note: d.overdue.length ? `${Math.round((d.overdue.length / Math.max(1, open.length)) * 100)}% of open tasks` : "All on time", href: "/tasks" },
  ];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const river: RiverDay[] = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(today, i);
    const wd = new Date(date + "T00:00:00Z").getUTCDay();
    return {
      date, day: Number(date.slice(8)), dow: DOW[wd], month: MON[Number(date.slice(5, 7)) - 1], weekend: wd === 0 || wd === 6, label: `${DOW[wd]}, ${formatDate(date)}`,
      hearings: upcoming.filter((h) => h.date === date).map((h) => ({ caseId: h.caseId, caseNumber: num(h.caseId), title: ws.cases.find((c) => c.id === h.caseId)?.title ?? "", confirmed: h.status === "confirmed" })),
      tasks: open.filter((t) => t.dueDate === date).map((t) => ({ caseId: t.caseId, caseNumber: num(t.caseId), title: t.title })),
    };
  });
  const table = (head: string[], rows: React.ReactNode[][]) => (
    <div className="overflow-x-auto"><table className="w-full"><thead><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="td">{c}</td>)}</tr>)}</tbody></table></div>
  );
  if (!ws.cases.length) return <><PageHeader title="Reports" /><EmptyState title="No data yet" body="Reports are built from your stored cases, hearings and tasks." /></>;
  return (
    <>
      <PageHeader eyebrow="Office" title="Reports" subtitle={`Operational reports from stored records, as of ${formatDate(today)}. No outcome predictions or risk scores.`} actions={<PrintButton />} />
      <PulseTiles tiles={tiles} />
      <HearingRiver days={river} />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <StageDonut data={[...byStage.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n }))} />
        <RankBars title="Adjournments per case" tone="violet" unit="adj." empty="No adjournments recorded." rows={adj.filter(({ s }) => s.adjournments > 0).map(({ c, s }) => ({ label: c.number, href: `/cases/${c.id}?tab=orders`, n: s.adjournments }))} />
        <RankBars title="Pending tasks by case" tone="warn" unit="open" empty="No open tasks." rows={workload.map(({ c, n }) => ({ label: c.number, href: `/cases/${c.id}?tab=tasks`, n }))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Upcoming hearings (30 days)">{upcoming.length ? table(["Date", "Case", "Status"], upcoming.map((h) => [formatDate(h.date), <Link key="c" className="link" href={`/cases/${h.caseId}`}>{num(h.caseId)}</Link>, h.status === "confirmed" ? "Confirmed" : "Awaiting verification"])) : <p className="text-sm text-muted">None.</p>}</Card>
        <Card title="Overdue tasks">{d.overdue.length ? table(["Due", "Case", "Task"], d.overdue.map((t) => [formatDate(t.dueDate), num(t.caseId), t.title])) : <p className="text-sm text-muted">None.</p>}</Card>
        <Card title="Orders awaiting verification">{d.awaitingReview.length ? table(["Uploaded", "Case (proposed)", ""], d.awaitingReview.map((j) => [formatDate(j.createdAt.slice(0, 10)), j.extraction?.caseNumber.value ?? "Unknown", <Link key="r" className="link" href={`/review/${j.id}`}>Review</Link>])) : <p className="text-sm text-muted">None.</p>}</Card>
        <Card title="Research reports awaiting review">{d.researchToReview.length ? table(["Case", "Version", ""], d.researchToReview.map((r) => [num(r.caseId), `v${r.versions.length}`, <Link key="o" className="link" href={`/research/${r.id}`}>Open</Link>])) : <p className="text-sm text-muted">None.</p>}</Card>
        <Card title="Definitions"><ul className="ml-5 list-disc text-sm text-muted"><li>Active cases exclude closed and archived cases.</li><li>Hearings count only current records (confirmed or awaiting verification), not superseded dates.</li><li>Overdue = open task whose due date is before today (India time).</li><li>Adjournments = approved orders where “adjourned” was approved as yes.</li></ul></Card>
      </div>
    </>
  );
}
