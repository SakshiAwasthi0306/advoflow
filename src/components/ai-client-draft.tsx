"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGES, languageLabel } from "@/lib/languages";

// Ask the AI for a client update in any supported language, from the case's confirmed facts. The result is an
// editable draft below; nothing is sent.
export function AIClientDraft({ caseId, defaultLang, aiReady, hasOrder }: { caseId: string; defaultLang: string; aiReady: boolean; hasOrder: boolean }) {
  const router = useRouter();
  const [lang, setLang] = useState(defaultLang);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [existing, setExisting] = useState(false);

  if (!aiReady) return <p className="text-sm text-muted">AI drafting is not set up on this server. English and Kannada drafts are still created from fixed wording when you approve an order.</p>;
  if (!hasOrder) return <p className="text-sm text-muted">Approve an order for this case first: updates are written only from confirmed order details.</p>;

  async function draft(replace: boolean) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/ai/client-updates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ caseId, lang, replace }) });
      const b = await r.json().catch(() => ({}));
      if (r.status === 409) { setExisting(true); setMsg({ tone: "warn", text: `A ${languageLabel(lang)} draft for the latest order is already below.` }); return; }
      if (!r.ok) { setMsg({ tone: "danger", text: b.error ?? "Could not draft the update." }); return; }
      setExisting(false);
      setMsg({ tone: "ok", text: `${languageLabel(lang)} draft added below. Check it${lang === "en" ? "" : " (an English rendering is included)"} before sending.${b.warnings?.length ? ` Note: ${b.warnings.join(" ")}` : ""}` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="ai-draft-lang">Language</label>
          <select id="ai-draft-lang" className="input w-auto" value={lang} onChange={(e) => { setLang(e.target.value); setExisting(false); setMsg(null); }}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{languageLabel(l.code)}</option>)}
          </select>
        </div>
        <button className="btn-primary" disabled={busy} onClick={() => draft(false)}>{busy ? "Drafting…" : "Draft with AI"}</button>
        {existing && <button className="btn-secondary" disabled={busy} onClick={() => draft(true)}>Replace that draft</button>}
      </div>
      <p className="hint">Written only from this case&apos;s confirmed details. Nothing is sent; you can edit the draft before opening it in WhatsApp.</p>
      {msg && <p role={msg.tone === "danger" ? "alert" : "status"} className={`text-sm ${msg.tone === "danger" ? "text-danger" : msg.tone === "warn" ? "text-warn" : "text-ok"}`}>{msg.text}</p>}
    </div>
  );
}
