import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/client";
import { Motion } from "@/components/motion";
import { CasePeek, CommandPalette, type PeekCase } from "@/components/delight";
import { Shell, type Alert } from "@/components/shell";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { loadWorkspace } from "@/lib/services/workspace";
import { caseSummary, dashboard } from "@/lib/services/queries";
import { formatDate, todayIST } from "@/lib/dates";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: { default: "AdvoFlow", template: "%s · AdvoFlow" }, description: "Court diary, order review and legal research for advocates" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F5F7FA" }, { media: "(prefers-color-scheme: dark)", color: "#0B1421" }] };

// A crisp grotesk for headings; a clean sans for the interface; a mono for case numbers and dates.
const display = Hanken_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
const fonts = `${display.variable} ${sans.variable} ${mono.variable}`;
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    return (
      <html lang="en" className={fonts}><body><ToastProvider>{children}</ToastProvider><Motion /></body></html>
    );
  }
  const ws = await loadWorkspace(getStore(), session);
  const d = dashboard(ws);
  const num = (id: string) => ws.cases.find((c) => c.id === id)?.number ?? "case";
  const alerts: Alert[] = [
    ...d.overdue.map((t) => ({ text: `Overdue: ${t.title} (${num(t.caseId)})`, href: `/cases/${t.caseId}?tab=tasks`, tone: "danger" as const })),
    ...d.needsReschedule.map((t) => ({ text: `Hearing moved — review task: ${t.title}`, href: `/cases/${t.caseId}?tab=tasks`, tone: "warn" as const })),
    ...d.awaitingReview.map((j) => ({ text: `Order awaiting verification${j.match?.caseId ? ` (${num(j.match.caseId)})` : ""}`, href: `/review/${j.id}`, tone: "warn" as const })),
    ...d.unconfirmedHearings.map((h) => ({ text: `Hearing date not confirmed: ${num(h.caseId)}`, href: `/cases/${h.caseId}?tab=orders`, tone: "warn" as const })),
    ...d.tomorrowHearings.map((h) => ({ text: `Hearing tomorrow: ${num(h.caseId)}${h.purpose ? ` – ${h.purpose}` : ""}`, href: `/cases/${h.caseId}`, tone: "warn" as const })),
    ...d.dueToday.map((t) => ({ text: `Due today: ${t.title}`, href: `/cases/${t.caseId}?tab=tasks`, tone: "warn" as const })),
  ];
  // Light case summaries for the command palette and hover previews.
  const today = todayIST();
  const peek: PeekCase[] = ws.cases.filter((c) => c.status !== "archived").slice(0, 500).map((c) => {
    const s = caseSummary(ws, c, today);
    const h = s.hearing && s.hearing.date >= today ? s.hearing : null;
    return { id: c.id, number: c.number, title: c.title, court: c.court, stage: c.stage, next: h ? { date: h.date, label: h.date === today ? "Today" : formatDate(h.date).replace(/ \d{4}$/, ""), confirmed: h.status === "confirmed" } : null, open: s.openTasks, overdue: s.overdue };
  });
  const notes: string[] = [];
  if (config.authMode === "demo") notes.push(config.databaseUrl ? "Open demo: no login, anyone with the link sees and can change this data" : "Demo mode: no login, data stored on this machine only");
  if (config.aiProvider === "rules") notes.push("AI not connected (rule-based extraction)");
  if (config.researchConnector === "demo") notes.push("Legal research uses fictional demo sources");
  if (config.researchConnector === "opendata") notes.push("Legal research: real judgments from eCourts open data, keyword search");
  return (
    <html lang="en" className={fonts}>
      <body>
        <ToastProvider>
          <Shell office={ws.office.name} user={session.name} role={session.role} alerts={alerts} reviewCount={d.awaitingReview.length} modeNote={notes.length ? notes.join(" · ") : null}>
            {children}
          </Shell>
          <CommandPalette cases={peek} />
        </ToastProvider>
        <CasePeek cases={peek} />
        <Motion />
      </body>
    </html>
  );
}
