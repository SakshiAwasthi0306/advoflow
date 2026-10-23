"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarCheck2, ListChecks, MessageSquareText, NotebookTabs } from "lucide-react";
import type { CaseMatch, Extraction, FieldStatus } from "@/lib/types";
import { api, useToast } from "./client";

type FieldKey = "orderDate" | "nextHearingDate" | "stage" | "summary" | "adjourned" | "costs" | "court" | "title";
const LABELS: Record<FieldKey, string> = {
  orderDate: "Order date", nextHearingDate: "Next hearing date", stage: "Procedural stage", summary: "What happened",
  adjourned: "Adjourned?", costs: "Costs", court: "Court", title: "Case title / parties",
};
const KIND: Record<FieldKey, "date" | "text" | "long" | "bool"> = { orderDate: "date", nextHearingDate: "date", stage: "text", summary: "long", adjourned: "bool", costs: "text", court: "text", title: "text" };

function StatusTag({ s }: { s: FieldStatus }) {
  // Ink for what the order says in its own words; pencil for a reading that still needs a person's check.
  if (s === "stated") return <span className="inline-flex items-center gap-1 rounded-md border border-navy-100 bg-navy-50 px-1.5 py-0.5 text-[11px] font-medium text-navy-800" title="Written in the order; the quoted passage is shown">✓ In the order</span>;
  if (s === "inferred") return <span className="ai-chip" title="A reading of the order, not its exact words. Check it.">✎ Reading — check</span>;
  return <span className="inline-flex rounded-md border border-neutral-line bg-neutral-soft px-1.5 py-0.5 text-[11px] font-medium text-neutral">Not in the order</span>;
}

export function ReviewForm({ jobId, ex, match, cases, readOnly }: { jobId: string; ex: Extraction | null; match: CaseMatch | null; cases: { id: string; number: string; title: string }[]; readOnly: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const empty = { value: null, status: "missing" as FieldStatus, source: null };
  const src = (k: FieldKey) => (ex ? (ex[k] as { value: unknown; status: FieldStatus; source: string | null; page?: number | null }) : empty);

  const [fields, setFields] = useState(() =>
    Object.fromEntries((Object.keys(LABELS) as FieldKey[]).map((k) => {
      const f = src(k);
      return [k, { approved: f.value !== null && f.value !== undefined, value: f.value as string | boolean | null }];
    })) as Record<FieldKey, { approved: boolean; value: string | boolean | null }>,
  );
  const [confirmHearing, setConfirmHearing] = useState(false);
  const [mode, setMode] = useState<"existing" | "new" | "">(match?.kind === "exact" ? "existing" : match?.kind === "ambiguous" ? "" : "new");
  const [caseId, setCaseId] = useState<string>(match?.kind === "exact" ? match.caseId ?? "" : "");
  const [newCase, setNewCase] = useState({ number: ex?.caseNumber.value ?? "", title: ex?.title.value ?? "", court: ex?.court.value ?? "", caseType: "" });
  const [directions, setDirections] = useState((ex?.directions ?? []).join("\n"));
  const [tasks, setTasks] = useState((ex?.tasks ?? []).map((t) => ({ key: t.key, approved: t.dueBasis !== "none" || t.key === "costs", title: t.title, dueDate: t.dueDate, priority: t.priority as "high" | "normal" | "low", basis: t.dueBasis, source: t.source })));
  const [busy, setBusy] = useState<"" | "approve" | "reject">("");
  const [error, setError] = useState<string | null>(null);
  const [armedReject, setArmedReject] = useState(false);
  const [burst, setBurst] = useState<null | { hearing: string | null; tasks: number }>(null);

  const set = (k: FieldKey, patch: Partial<{ approved: boolean; value: string | boolean | null }>) => setFields({ ...fields, [k]: { ...fields[k], ...patch } });

  async function approve() {
    setError(null);
    if (!mode) { setError("Choose which case this order belongs to."); return; }
    if (mode === "existing" && !caseId) { setError("Select the existing case."); return; }
    if (mode === "new" && !newCase.number.trim()) { setError("Enter the case number for the new case."); return; }
    setBusy("approve");
    try {
      const input = {
        caseDecision: mode === "existing" ? { mode, caseId } : { mode, ...newCase },
        fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { approved: v.approved && v.value !== null && v.value !== "", value: v.value === "" ? null : v.value }])),
        confirmHearing: confirmHearing && fields.nextHearingDate.approved,
        directions: directions.split("\n").map((s) => s.trim()).filter(Boolean),
        tasks: tasks.map(({ key, approved, title, dueDate, priority }) => ({ key, approved, title, dueDate: dueDate || null, priority })),
      };
      const r = await api<{ caseId: string; alreadyApproved: boolean }>(`/api/jobs/${jobId}`, "POST", { action: "approve", input });
      toast(r.alreadyApproved ? "This order was already approved — nothing was duplicated." : "Order confirmed. Case, hearing, tasks and client drafts updated.", "ok", r.alreadyApproved ? "tick" : "chime");
      // Show where the confirmation went before moving on: the diary, the hearing, the tasks and the client drafts.
      if (!r.alreadyApproved && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setBurst({ hearing: fields.nextHearingDate.approved ? (fields.nextHearingDate.value as string | null) : null, tasks: tasks.filter((t) => t.approved).length });
        await new Promise((res) => setTimeout(res, 1900));
      }
      router.push(`/cases/${r.caseId}?tab=orders`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function reject() {
    if (!armedReject) { setArmedReject(true); setTimeout(() => setArmedReject(false), 4000); return; }
    setBusy("reject");
    try {
      await api(`/api/jobs/${jobId}`, "POST", { action: "reject" });
      toast("Proposal rejected. Your records were not changed; the document is kept.");
      router.push("/upload");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
    {burst && <ConfirmBurst hearing={burst.hearing} tasks={burst.tasks} />}
    <fieldset disabled={readOnly} className="min-w-0 space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold">1. Which case is this?</h3>
        {match?.kind === "ambiguous" && <p className="mb-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">The case match is unclear. AdvoFlow will not merge it on its own — choose the correct case or create a new one.</p>}
        <div className="space-y-2 text-sm">
          {(match?.candidates.length ? match.candidates : []).map((c) => (
            <label key={c.caseId} className="flex items-start gap-2 rounded-lg border border-line p-2">
              <input type="radio" name="case" className="mt-1 accent-navy-900" checked={mode === "existing" && caseId === c.caseId} onChange={() => { setMode("existing"); setCaseId(c.caseId); }} />
              <span><span className="font-medium">{c.number}</span> · {c.title}<span className="block text-xs text-muted">{c.reason}</span></span>
            </label>
          ))}
          <label className="flex items-start gap-2 rounded-lg border border-line p-2">
            <input type="radio" name="case" className="mt-1 accent-navy-900" checked={mode === "existing" && !match?.candidates.some((c) => c.caseId === caseId)} onChange={() => { setMode("existing"); setCaseId(""); }} />
            <span className="flex-1">Another existing case
              {mode === "existing" && !match?.candidates.some((c) => c.caseId === caseId) && (
                <select aria-label="Existing case" className="input mt-1" value={caseId} onChange={(e) => setCaseId(e.target.value)}><option value="">Select…</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.number} · {c.title}</option>)}</select>
              )}
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-line p-2">
            <input type="radio" name="case" className="mt-1 accent-navy-900" checked={mode === "new"} onChange={() => setMode("new")} />
            <span className="flex-1">Create a new case
              {mode === "new" && (
                <span className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input aria-label="New case number" className="input" value={newCase.number} onChange={(e) => setNewCase({ ...newCase, number: e.target.value })} placeholder="Case number *" />
                  <input aria-label="New case title" className="input" value={newCase.title} onChange={(e) => setNewCase({ ...newCase, title: e.target.value })} placeholder="Petitioner v. Respondent" />
                  <input aria-label="New case court" className="input sm:col-span-2" value={newCase.court} onChange={(e) => setNewCase({ ...newCase, court: e.target.value })} placeholder="Court" />
                </span>
              )}
            </span>
          </label>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">2. Check each detail</h3>
        <p className="mb-2 text-xs text-muted">Only ticked fields are saved. Untick anything wrong, or correct it first.</p>
        <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-surface">
          {(Object.keys(LABELS) as FieldKey[]).map((k) => {
            const f = src(k);
            const v = fields[k];
            return (
              <div key={k} data-field={k} className={`rv-row grid gap-2 p-3.5 sm:grid-cols-[170px_1fr] ${f.status === "inferred" ? "bg-ai-soft/60" : k === "nextHearingDate" ? "bg-navy-50/50" : ""}`}>
                <div className="flex items-start gap-2">
                  <input id={`ap-${k}`} type="checkbox" className="mt-1 accent-navy-900" checked={v.approved} onChange={(e) => set(k, { approved: e.target.checked })} />
                  <label htmlFor={`ap-${k}`} className="text-sm font-medium">{LABELS[k]}<span className="mt-1 block"><StatusTag s={f.status} /></span></label>
                </div>
                <div className="min-w-0">
                  {KIND[k] === "date" && <input aria-label={LABELS[k]} type="date" className="input w-auto" value={(v.value as string) ?? ""} onChange={(e) => set(k, { value: e.target.value || null, approved: !!e.target.value })} />}
                  {KIND[k] === "text" && <input aria-label={LABELS[k]} className="input" value={(v.value as string) ?? ""} onChange={(e) => set(k, { value: e.target.value })} />}
                  {KIND[k] === "long" && <textarea aria-label={LABELS[k]} className="input min-h-[70px]" value={(v.value as string) ?? ""} onChange={(e) => set(k, { value: e.target.value })} />}
                  {KIND[k] === "bool" && <select aria-label={LABELS[k]} className="input w-auto" value={v.value === null ? "" : v.value ? "yes" : "no"} onChange={(e) => set(k, { value: e.target.value === "" ? null : e.target.value === "yes" })}><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select>}
                  {f.source && <blockquote className="mt-2 border-l-2 border-accent-line pl-2.5 text-xs leading-relaxed text-muted"><span className="kicker !text-[9.5px]">From the order{f.page ? ` · p. ${f.page}` : ""}</span><span className="mt-0.5 block font-serif text-[13px] italic text-ink/75">“{f.source}”</span></blockquote>}
                  {k === "nextHearingDate" && (
                    <label className="mt-2 flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1 accent-navy-900" checked={confirmHearing} disabled={!v.approved || !v.value} onChange={(e) => setConfirmHearing(e.target.checked)} />
                      <span><strong>I have checked this date against the original order.</strong> <span className="text-muted">If unticked, the hearing is saved as “awaiting verification” and will not show as confirmed.</span></span>
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">3. Court directions (as stated)</h3>
        <textarea aria-label="Directions, one per line" className="input min-h-[80px] text-sm" value={directions} onChange={(e) => setDirections(e.target.value)} placeholder="One direction per line" />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">4. Suggested tasks</h3>
        <p className="mb-2 text-xs text-muted">Suggestions only. Ticked tasks are created when you confirm. Due dates come from the order, or from the next hearing when the order says “on or before the next date”.</p>
        {tasks.length ? (
          <ul className="space-y-2">
            {tasks.map((t, i) => (
              <li key={t.key + i} className="grid gap-2 rounded-lg border border-line p-2 sm:grid-cols-[auto_1fr_160px_110px] sm:items-center">
                <input aria-label={`Create task: ${t.title}`} type="checkbox" className="accent-navy-900" checked={t.approved} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, approved: e.target.checked } : x)))} />
                <div><input aria-label="Task title" className="input" value={t.title} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <span className="mt-1 block text-xs text-muted">{t.basis === "stated_in_order" ? "Date stated in the order" : t.basis === "next_hearing" ? "Due by the next hearing (per the order)" : "No date in the order"}</span></div>
                <input aria-label="Task due date" type="date" className="input" value={t.dueDate ?? ""} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, dueDate: e.target.value || null } : x)))} />
                <select aria-label="Task priority" className="input" value={t.priority} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, priority: e.target.value as "high" } : x)))}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No tasks suggested. You can add tasks on the case after confirming.</p>}
      </section>

      {error && <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {!readOnly && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-line bg-surface/95 px-4 py-3 sm:-mx-5 sm:px-5">
          <button type="button" className="btn-primary" onClick={approve} disabled={!!busy}>{busy === "approve" ? "Saving…" : "Review and confirm"}</button>
          <button type="button" className="btn-danger" onClick={reject} disabled={!!busy}>{armedReject ? "Click again to reject" : "Reject proposed update"}</button>
          <span className="self-center text-xs text-muted">Confirming adds the order to the timeline, updates the hearing, creates ticked tasks and drafts client messages — all together.</span>
        </div>
      )}
    </fieldset>
    </>
  );
}

/** One confirmation, four records: they fan out from the centre to show everything that was updated. */
function ConfirmBurst({ hearing, tasks }: { hearing: string | null; tasks: number }) {
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  const items = [
    { icon: NotebookTabs, label: "Case diary", sub: "order added to the timeline", x: -1, y: -1 },
    { icon: CalendarCheck2, label: "Hearing", sub: hearing ? `next date ${fmt(hearing)}` : "no new date", x: 1, y: -1 },
    { icon: ListChecks, label: "Tasks", sub: tasks ? `${tasks} created` : "none created", x: -1, y: 1 },
    { icon: MessageSquareText, label: "Client drafts", sub: "ready to send", x: 1, y: 1 },
  ];
  return (
    <div className="cb-wrap fixed inset-0 z-[80] grid place-items-center" role="status" aria-live="assertive">
      <div className="cb-backdrop absolute inset-0 bg-navy-950/55 backdrop-blur-sm" />
      <div className="relative h-[320px] w-[min(92vw,560px)]">
        <div className="cb-core absolute left-1/2 top-1/2 grid h-24 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-b from-accent to-navy-800 text-white shadow-glow">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path className="cb-check" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        {items.map((it, i) => (
          <div key={it.label} className="cb-item card-raised absolute left-1/2 top-1/2 flex w-[200px] items-center gap-2.5 px-3 py-2.5" style={{ "--tx": `${it.x * 150}px`, "--ty": `${it.y * 105}px`, animationDelay: `${300 + i * 110}ms` } as React.CSSProperties}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><it.icon className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0 text-left"><span className="block text-sm font-semibold">{it.label} ✓</span><span className="block truncate text-xs text-muted">{it.sub}</span></span>
          </div>
        ))}
        <p className="cb-caption absolute inset-x-0 bottom-0 text-center text-sm font-medium text-white">Confirmed. Everything is up to date.</p>
      </div>
    </div>
  );
}
