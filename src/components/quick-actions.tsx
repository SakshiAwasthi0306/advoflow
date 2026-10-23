"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, FilePlus2, FileText, ListPlus } from "lucide-react";
import { api, Dialog, useToast } from "./client";

const tile = "group flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-left text-sm transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-navy-700/30 hover:shadow-lift focus-visible:-translate-y-px";
// Each action has its own colour, so the row reads at a glance: cases blue, orders teal, tasks amber, hearings rose.
const HUES = {
  blue: "bg-blue-500/10 text-blue-600 group-hover:bg-blue-600 group-hover:text-white dark:text-blue-300",
  teal: "bg-teal-500/10 text-teal-600 group-hover:bg-teal-600 group-hover:text-white dark:text-teal-300",
  amber: "bg-amber-500/15 text-amber-700 group-hover:bg-amber-500 group-hover:text-white dark:text-amber-300",
  rose: "bg-rose-500/10 text-rose-600 group-hover:bg-rose-600 group-hover:text-white dark:text-rose-300",
} as const;
const iconWrap = (hue: keyof typeof HUES) => `grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${HUES[hue]}`;

export function QuickActions({ cases, canConfirm, today }: { cases: { id: string; number: string; title: string }[]; canConfirm: boolean; today: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Link href="/cases/new" className={tile}><span className={iconWrap("blue")}><FilePlus2 className="h-4 w-4" aria-hidden /></span><span><span className="block font-medium">Add a case</span><span className="block text-xs text-muted">Number, parties, court</span></span></Link>
      <Link href="/upload" className={tile}><span className={iconWrap("teal")}><FileText className="h-4 w-4" aria-hidden /></span><span><span className="block font-medium">Record an order</span><span className="block text-xs text-muted">Upload or paste it</span></span></Link>
      <Link href="/tasks#add" className={tile}><span className={iconWrap("amber")}><ListPlus className="h-4 w-4" aria-hidden /></span><span><span className="block font-medium">Create a task</span><span className="block text-xs text-muted">With a due date</span></span></Link>
      <AddHearing cases={cases} canConfirm={canConfirm} today={today} />
    </div>
  );
}

export function AddHearing({ cases, canConfirm, today, caseId, triggerClass }: { cases: { id: string; number: string; title: string }[]; canConfirm: boolean; today: string; caseId?: string; triggerClass?: string }) {
  return (
    <Dialog
      title="Add a hearing"
      triggerClass={triggerClass ?? tile}
      trigger={triggerClass ? <><CalendarPlus className="h-4 w-4" aria-hidden /> Add hearing</> : <><span className={iconWrap("rose")}><CalendarPlus className="h-4 w-4" aria-hidden /></span><span><span className="block font-medium">Add a hearing</span><span className="block text-xs text-muted">Date noted in court</span></span></>}
    >
      {(close) => <HearingForm cases={cases} canConfirm={canConfirm} today={today} caseId={caseId} onDone={close} />}
    </Dialog>
  );
}

function HearingForm({ cases, canConfirm, today, caseId, onDone }: { cases: { id: string; number: string; title: string }[]; canConfirm: boolean; today: string; caseId?: string; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!cases.length) return <p className="text-sm text-muted">Add a case first; hearings belong to a case.</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true); setErr(null);
        try {
          await api(`/api/cases/${String(f.get("caseId"))}/hearings`, "POST", { date: String(f.get("date")), purpose: String(f.get("purpose") ?? ""), confirmed: f.get("confirmed") === "on" });
          toast(f.get("confirmed") === "on" ? "Hearing added and confirmed" : "Hearing added. It will show as awaiting verification.");
          onDone();
          router.refresh();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="label" htmlFor="h-case">Case</label>
        <select id="h-case" name="caseId" className="input" defaultValue={caseId ?? cases[0].id} required>
          {cases.map((c) => <option key={c.id} value={c.id}>{c.number}{c.title ? ` — ${c.title.slice(0, 60)}` : ""}</option>)}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="h-date">Date</label><input id="h-date" name="date" type="date" min={today} className="input num" required /></div>
        <div><label className="label" htmlFor="h-purpose">Purpose <span className="font-normal text-muted">(optional)</span></label><input id="h-purpose" name="purpose" className="input" placeholder="e.g. Arguments" maxLength={160} /></div>
      </div>
      {canConfirm ? (
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed" className="mt-1 h-4 w-4 accent-[rgb(var(--c-navy-900))]" /><span>I have checked this date against the cause list or order. <span className="text-muted">Unticked, it is saved as awaiting verification.</span></span></label>
      ) : <p className="hint">Saved as awaiting verification; an advocate confirms it.</p>}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Add to diary"}</button>
      </div>
    </form>
  );
}
