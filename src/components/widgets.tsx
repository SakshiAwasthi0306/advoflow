"use client";

import { language } from "@/lib/languages";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { ActionButton, api, CopyButton, useToast } from "./client";

// ---- Tasks ----------------------------------------------------------------------

export function TaskToggle({ id, done, title }: { id: string; done: boolean; title: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <input
      type="checkbox"
      className="mt-1 h-4 w-4 accent-navy-900"
      checked={done}
      disabled={busy}
      aria-label={done ? `Reopen task: ${title}` : `Mark done: ${title}`}
      onChange={async () => {
        setBusy(true);
        try {
          await api(`/api/tasks/${id}`, "PATCH", { status: done ? "open" : "done" });
          toast(done ? "Task reopened" : "Task completed");
          router.refresh();
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function TaskEdit({ id, title, dueDate, priority }: { id: string; title: string; dueDate: string | null; priority: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title, dueDate: dueDate ?? "", priority });
  if (!open) return <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>Edit</button>;
  return (
    <form
      className="mt-2 grid gap-2 rounded-lg border border-line bg-paper p-2 sm:grid-cols-[1fr_150px_120px_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/api/tasks/${id}`, "PATCH", { title: v.title, dueDate: v.dueDate || null, priority: v.priority });
          toast("Task updated");
          setOpen(false);
          router.refresh();
        } catch (ex) {
          toast((ex as Error).message, "error");
        }
      }}
    >
      <input aria-label="Task title" className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      <input aria-label="Due date" type="date" className="input" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} />
      <select aria-label="Priority" className="input" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select>
      <span className="flex gap-1"><button className="btn-primary btn-sm">Save</button><button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button></span>
    </form>
  );
}

export function AddTaskForm({ cases, fixedCaseId }: { cases: { id: string; number: string }[]; fixedCaseId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ caseId: fixedCaseId ?? cases[0]?.id ?? "", title: "", dueDate: "", priority: "normal", description: "" });
  const [busy, setBusy] = useState(false);
  if (!cases.length && !fixedCaseId) return <p className="text-sm text-muted">Create a case first; every task belongs to a case.</p>;
  return (
    <form
      id="add"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_160px_130px_auto] lg:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/tasks", "POST", { ...v, dueDate: v.dueDate || null });
          toast("Task added");
          setV({ ...v, title: "", dueDate: "", description: "" });
          router.refresh();
        } catch (ex) {
          toast((ex as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {!fixedCaseId && (
        <div><label className="label" htmlFor="t-case">Case</label><select id="t-case" className="input" value={v.caseId} onChange={(e) => setV({ ...v, caseId: e.target.value })}>{cases.map((c) => <option key={c.id} value={c.id}>{c.number}</option>)}</select></div>
      )}
      <div className={fixedCaseId ? "lg:col-span-2" : ""}><label className="label" htmlFor="t-title">Task</label><input id="t-title" required minLength={2} className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. File rejoinder" /></div>
      <div><label className="label" htmlFor="t-due">Due date</label><input id="t-due" type="date" className="input" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} /></div>
      <div><label className="label" htmlFor="t-pri">Priority</label><select id="t-pri" className="input" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></div>
      <button className="btn-primary" disabled={busy}>{busy ? "Adding…" : "Add task"}</button>
    </form>
  );
}

export function RescheduleActions({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <span className="flex flex-wrap gap-1">
      <ActionButton url={`/api/tasks/${id}/reschedule`} body={{ action: "move" }} className="btn-primary btn-sm" success="Task moved to the new date">Move to {to}</ActionButton>
      <ActionButton url={`/api/tasks/${id}/reschedule`} body={{ action: "keep" }} success="Kept the original due date">Keep {from}</ActionButton>
    </span>
  );
}

// ---- Hearings -------------------------------------------------------------------

export function HearingConfirm({ id, date }: { id: string; date: string }) {
  const [d, setD] = useState(date);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`h-${id}`}>Hearing date</label>
      <input id={`h-${id}`} type="date" className="input w-auto py-1" value={d} onChange={(e) => setD(e.target.value)} />
      <ActionButton url={`/api/hearings/${id}`} body={{ action: "confirm", date: d }} className="btn-primary btn-sm" success="Hearing date confirmed">Confirm date</ActionButton>
      <ActionButton url={`/api/hearings/${id}`} body={{ action: "cancel" }} className="btn-ghost btn-sm" confirmText="Click again to cancel" success="Hearing cancelled">Cancel hearing</ActionButton>
    </span>
  );
}

// ---- Client updates ---------------------------------------------------------------

export function ClientUpdateEditor({ id, text, lang, status, phone, waLinkBase }: { id: string; text: string; lang: string; status: string; phone: string | null; waLinkBase: string }) {
  const router = useRouter();
  const toast = useToast();
  const [t, setT] = useState(text);
  const dirty = t !== text;
  const digits = (phone ?? "").replace(/\D/g, "");
  const wa = `${waLinkBase}${digits.length === 10 ? "91" + digits : digits}?text=${encodeURIComponent(t)}`;
  return (
    <div>
      <label className="sr-only" htmlFor={`cu-${id}`}>{`${language(lang).name} message`}</label>
      <textarea id={`cu-${id}`} lang={lang} dir={language(lang).rtl ? "rtl" : "auto"} className="input min-h-[110px]" value={t} onChange={(e) => setT(e.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button className="btn-secondary btn-sm" disabled={!dirty} onClick={async () => { try { await api(`/api/client-updates/${id}`, "PATCH", { text: t }); toast("Draft saved"); router.refresh(); } catch (e) { toast((e as Error).message, "error"); } }}>Save edits</button>
        <CopyButton text={t} />
        <a
          className="btn-secondary btn-sm"
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={async () => { try { await api(`/api/client-updates/${id}`, "PATCH", { text: t, status: "handed_off" }); router.refresh(); } catch { /* opening WhatsApp still works */ } }}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Open in WhatsApp
        </a>
        {status === "handed_off" && <span className="text-xs text-muted">Opened in WhatsApp — delivery is not confirmed</span>}
      </div>
    </div>
  );
}

export function LinkClient({ caseId, current, clients }: { caseId: string; current: string | null; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <span className="flex items-center gap-2">
      <label className="sr-only" htmlFor="link-client">Client</label>
      <select
        id="link-client"
        className="input w-auto py-1"
        value={current ?? ""}
        onChange={async (e) => {
          try { await api(`/api/cases/${caseId}/client`, "POST", { clientId: e.target.value || null }); toast("Client linked"); router.refresh(); } catch (ex) { toast((ex as Error).message, "error"); }
        }}
      >
        <option value="">No client linked</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <Link href="/clients" className="link text-sm">Manage clients</Link>
    </span>
  );
}

// ---- Research start -----------------------------------------------------------------

export function ResearchStart({ caseId, orders, docs, reportId, defaultQuestion = "" }: { caseId: string; orders: { id: string; label: string }[]; docs: { id: string; label: string }[]; reportId?: string; defaultQuestion?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState(defaultQuestion);
  const [actingFor, setActingFor] = useState("unspecified");
  const [sel, setSel] = useState<string[]>(orders.slice(0, 3).map((o) => o.id));
  const [dsel, setDsel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api<{ reportId: string; version: number }>("/api/research", "POST", { caseId, reportId, question: q, orderIds: sel, documentIds: dsel, actingFor });
          toast(`Research report v${r.version} ready for review`);
          router.push(`/research/${r.reportId}?v=${r.version}`);
          router.refresh();
        } catch (ex) {
          toast((ex as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div><label className="label" htmlFor="rq">Research question (optional)</label><textarea id="rq" className="input min-h-[70px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Can we ask the court to proceed without the written statement?" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset><legend className="label">Approved orders to analyse</legend>
          {orders.length ? orders.map((o) => <label key={o.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" className="accent-navy-900" checked={sel.includes(o.id)} onChange={() => setSel(toggle(sel, o.id))} />{o.label}</label>) : <p className="text-sm text-muted">No approved orders yet. Research will use the case record only.</p>}
        </fieldset>
        <div className="space-y-3">
          <fieldset><legend className="label">Other case documents</legend>
            {docs.length ? docs.map((d) => <label key={d.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" className="accent-navy-900" checked={dsel.includes(d.id)} onChange={() => setDsel(toggle(dsel, d.id))} />{d.label}</label>) : <p className="text-sm text-muted">None.</p>}
          </fieldset>
          <div><label className="label" htmlFor="af">You act for</label><select id="af" className="input" value={actingFor} onChange={(e) => setActingFor(e.target.value)}><option value="unspecified">Not specified</option><option value="petitioner">Petitioner / plaintiff</option><option value="respondent">Respondent / defendant</option></select></div>
        </div>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Researching… this can take a minute" : reportId ? "Rerun research (new version)" : "Start legal research"}</button>
    </form>
  );
}
