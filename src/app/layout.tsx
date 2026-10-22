import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/client";
import { Shell, type Alert } from "@/components/shell";
import { getSession } from "@/lib/session";
import { getStore } from "@/lib/store";
import { loadWorkspace } from "@/lib/services/workspace";
import { dashboard } from "@/lib/services/queries";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: { default: "AdvoFlow", template: "%s · AdvoFlow" }, description: "Court diary, order review and legal research for advocates" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#12234A" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) {
    return (
      <html lang="en"><body><ToastProvider>{children}</ToastProvider></body></html>
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
  const notes: string[] = [];
  if (config.authMode === "demo") notes.push(config.databaseUrl ? "Open demo: no login, anyone with the link sees and can change this data" : "Demo mode: no login, data stored on this machine only");
  if (!config.anthropicKey) notes.push("AI not connected (rule-based demo extraction)");
  if (config.researchConnector !== "indiankanoon") notes.push("Legal research uses fictional demo sources");
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <Shell office={ws.office.name} user={session.name} role={session.role} alerts={alerts} reviewCount={d.awaitingReview.length} modeNote={notes.length ? notes.join(" · ") : null}>
            {children}
          </Shell>
        </ToastProvider>
      </body>
    </html>
  );
}
