"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Printer } from "lucide-react";
import { api, Dialog, useToast } from "./client";

export function NoteForm({ url }: { url: string }) {
  const router = useRouter();
  const toast = useToast();
  const [t, setT] = useState("");
  return (
    <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); try { await api(url, "POST", { type: "note", text: t }); setT(""); toast("Note saved"); router.refresh(); } catch (ex) { toast((ex as Error).message, "error"); } }}>
      <label className="label" htmlFor="note">Add your note</label>
      <textarea id="note" className="input min-h-[70px]" value={t} onChange={(e) => setT(e.target.value)} placeholder="Your own analysis, a paragraph to read, a point to raise…" />
      <button className="btn-secondary btn-sm" disabled={!t.trim()}>Save note</button>
    </form>
  );
}

/** Two-step: the advocate sees and edits the task, then confirms. Nothing is created before that. */
export function StepToTask({ url, stepId, text, nextHearing }: { url: string; stepId: string; text: string; nextHearing: string | null }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <Dialog trigger="Make this a task…" triggerClass="btn-ghost btn-sm" title="Create a task from this recommendation">
      {(close) => <StepTaskForm onDone={() => { close(); router.refresh(); }} url={url} stepId={stepId} text={text} nextHearing={nextHearing} toast={toast} />}
    </Dialog>
  );
}

function StepTaskForm({ url, stepId, text, nextHearing, onDone, toast }: { url: string; stepId: string; text: string; nextHearing: string | null; onDone: () => void; toast: (t: string, tone?: "ok" | "error") => void }) {
  const [title, setTitle] = useState(text.slice(0, 200));
  const [due, setDue] = useState("");
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await api(url, "POST", { type: "create_task", stepId, title, dueDate: due || null, confirm: true }); toast("Task created"); onDone(); } catch (ex) { toast((ex as Error).message, "error"); } }}>
      <p className="text-sm text-muted">This is a research suggestion, not a court direction. Set a due date only if you have a reason for it.</p>
      <div><label className="label" htmlFor="st-title">Task</label><textarea id="st-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><label className="label" htmlFor="st-due">Due date (optional)</label><input id="st-due" type="date" className="input w-auto" value={due} onChange={(e) => setDue(e.target.value)} />{nextHearing && <button type="button" className="btn-ghost btn-sm ml-2" onClick={() => setDue(nextHearing)}>Use next hearing ({nextHearing})</button>}</div>
      <button className="btn-primary">Confirm and create task</button>
    </form>
  );
}

export function PrintButton() {
  return <button type="button" className="btn-secondary" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Export / print</button>;
}

export function CaseOrderPicker({ cases }: { cases: { id: string; number: string; title: string }[] }) {
  const router = useRouter();
  return (
    <div>
      <label className="label" htmlFor="pick-case">Choose a case</label>
      <select id="pick-case" className="input" defaultValue="" onChange={(e) => e.target.value && router.push(`/research/new?case=${e.target.value}`)}>
        <option value="">Select a case…</option>
        {cases.map((c) => <option key={c.id} value={c.id}>{c.number} · {c.title}</option>)}
      </select>
    </div>
  );
}
