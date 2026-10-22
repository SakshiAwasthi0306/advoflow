"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useToast } from "./client";

export interface CaseFormValues {
  number: string; cnr: string; petitioner: string; respondent: string; court: string; caseType: string; stage: string; clientId: string | null;
}

export function CaseForm({ initial, caseId, clients }: { initial?: Partial<CaseFormValues>; caseId?: string; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<CaseFormValues>({ number: "", cnr: "", petitioner: "", respondent: "", court: "", caseType: "", stage: "", clientId: null, ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof CaseFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value || (k === "clientId" ? null : "") });

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const res = await api<{ case: { id: string } }>(caseId ? `/api/cases/${caseId}` : "/api/cases", caseId ? "PATCH" : "POST", v);
          toast(caseId ? "Case updated" : "Case created");
          router.push(`/cases/${res.case.id}`);
          router.refresh();
        } catch (ex) {
          setErr((ex as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {err && <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{err}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="number">Case number *</label><input id="number" required className="input" value={v.number} onChange={set("number")} placeholder="O.S. 482/2025" /><p className="hint">Duplicates are blocked: “OS 482 of 2025” and “O.S. 482/2025” count as the same case.</p></div>
        <div><label className="label" htmlFor="cnr">CNR number</label><input id="cnr" className="input" value={v.cnr} onChange={set("cnr")} placeholder="16 characters, e.g. KABC010012342025" maxLength={20} /></div>
        <div><label className="label" htmlFor="pet">Petitioner / plaintiff</label><input id="pet" className="input" value={v.petitioner} onChange={set("petitioner")} /></div>
        <div><label className="label" htmlFor="res">Respondent / defendant</label><input id="res" className="input" value={v.respondent} onChange={set("respondent")} /></div>
        <div><label className="label" htmlFor="court">Court</label><input id="court" className="input" value={v.court} onChange={set("court")} placeholder="e.g. City Civil Court, Bengaluru" /></div>
        <div><label className="label" htmlFor="type">Case type</label><input id="type" className="input" value={v.caseType} onChange={set("caseType")} placeholder="e.g. Original Suit" /></div>
        <div><label className="label" htmlFor="stage">Current stage</label><input id="stage" className="input" value={v.stage} onChange={set("stage")} placeholder="e.g. Written statement" /></div>
        <div><label className="label" htmlFor="client">Client</label><select id="client" className="input" value={v.clientId ?? ""} onChange={set("clientId")}><option value="">No client linked</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      <div className="flex gap-2"><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : caseId ? "Save changes" : "Create case"}</button><button type="button" className="btn-ghost" onClick={() => router.back()}>Cancel</button></div>
    </form>
  );
}
