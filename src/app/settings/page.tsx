import { pageData } from "@/lib/server";
import { config, integrationStatus } from "@/lib/config";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client";
import { LogoutButton } from "@/components/logout";
import { DiaryImport } from "@/components/diary-import";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const { ws, session } = await pageData();
  const st = integrationStatus();
  const rows: [string, { live: boolean; label: string }][] = [["AI extraction & research", st.ai], ["Database", st.database], ["Sign-in", st.auth], ["Legal research source", st.research], ["OCR", st.ocr], ["Document storage", st.storage], ...(config.authMode === "password" ? [["Two-step login", st.twoStep] as [string, { live: boolean; label: string }], ...(config.twoStepLogin === "required" ? [["Sign-in codes (email)", st.email] as [string, { live: boolean; label: string }]] : [])] : []), ["Calendar", st.calendar], ["Client messaging", st.messaging]];
  return (
    <>
      <PageHeader eyebrow="Office" title="Settings" subtitle={`${ws.office.name} · signed in as ${session.name} (${session.role})`} actions={session.mode === "password" ? <LogoutButton /> : null} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What is live and what is demo">
          <ul className="divide-y divide-line text-sm">{rows.map(([k, v]) => <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="font-medium">{k}</span><span className="flex items-center gap-2 text-right text-muted">{v.label}{v.live ? <Badge tone="ok">Live</Badge> : <Badge tone="neutral">Not live</Badge>}</span></li>)}</ul>
          <p className="mt-3 text-xs text-muted">Configure these with environment variables on the server (see README). API keys are never sent to the browser.</p>
        </Card>
        <Card title="Demo workspace">
          <p className="mb-3 text-sm text-muted">Fictional cases, orders, clients and research, all labelled Demo. Removing them leaves anything you created.</p>
          {session.role !== "owner" ? <p className="text-sm text-muted">Only the office owner can load or remove demo data.</p> : ws.demoLoaded
            ? <ActionButton url="/api/demo" body={{ action: "clear" }} className="btn-danger" confirmText="Click again to remove demo data" success="Demo data removed">Remove demo data</ActionButton>
            : <ActionButton url="/api/demo" body={{ action: "load" }} className="btn-primary" success="Demo workspace loaded">Load demo workspace</ActionButton>}
        </Card>
        <Card title="Your data">
          <p className="mb-3 text-sm text-muted">Download every record for this office as JSON (owner only). Uploaded files stay in private storage.</p>
          {session.role === "owner" && <a className="btn-secondary" href="/api/export">Export office data</a>}
          <div className="mt-4"><Notice tone="neutral">Data in this office is never shown to another office. {config.databaseUrl ? "It is stored in PostgreSQL." : "In this setup it is stored as files in .data/ on this machine — fine for a demo, not for real client data."}</Notice></div>
        </Card>
        <Card title="Import from Case Diary">
          <p className="mb-3 text-sm text-muted">Bring cases, order history, tasks and client messages over from the original single-page Case Diary, which kept them in your browser.</p>
          {session.role === "owner" || session.role === "advocate" ? <DiaryImport /> : <p className="text-sm text-muted">Only an advocate or the office owner can import orders.</p>}
        </Card>
        <Card title="Team">
          <ul className="text-sm">{ws.members.map((m) => <li key={m.userId} className="flex justify-between py-1"><span>{m.name}</span><Badge tone="neutral" icon={false}>{m.role}</Badge></li>)}</ul>
          <p className="mt-2 text-xs text-muted">Add people with <code>npm run create-user</code> (password mode). Roles: owner, advocate (approves orders and research), clerk (uploads and tasks), viewer (read-only).</p>
        </Card>
      </div>
    </>
  );
}
