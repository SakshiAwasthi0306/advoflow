"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useToast } from "./client";
import { Notice } from "./ui";
import type { DiaryImportResult } from "@/lib/services/diary-import";

const SNIPPET = `copy(localStorage.getItem("case-diary-v1"))`;

export function DiaryImport() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiaryImportResult | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<{ result: DiaryImportResult }>("/api/import/case-diary", "POST", { data });
      setResult(r.result);
      setData("");
      toast(`Imported ${r.result.orders.imported} order(s) and ${r.result.tasks.imported} task(s)`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <ol className="list-decimal space-y-1 pl-5 text-muted">
        <li>Open your old Case Diary page in the browser where you used it.</li>
        <li>Open the browser console (right-click → Inspect → Console), run <code className="rounded bg-neutral-soft px-1 text-ink">{SNIPPET}</code> and press Enter.</li>
        <li>Paste the copied text below, or choose a saved .json file.</li>
      </ol>
      <label className="label" htmlFor="diary-data">Case Diary data</label>
      <textarea id="diary-data" className="input min-h-[96px] font-mono text-xs" placeholder='{"cases":{…}}' value={data} onChange={(e) => setData(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".json,.txt,application/json,text/plain"
          aria-label="Choose a Case Diary export file"
          className="text-xs"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setData(await f.text());
            e.target.value = "";
          }}
        />
        <button className="btn-primary" disabled={busy || data.trim().length < 2} onClick={run}>{busy ? "Importing…" : "Import"}</button>
      </div>
      <p className="hint">Every order comes in as approved history; next dates you had not verified in the diary stay “awaiting verification”. Importing the same data twice adds nothing.</p>
      {error && <Notice tone="danger" title="Nothing was imported">{error}</Notice>}
      {result && (
        <Notice tone="ok" title="Import finished">
          <ul className="list-disc pl-5">
            <li>Cases: {result.cases.created} new, {result.cases.matched} matched to existing cases</li>
            <li>Orders: {result.orders.imported} imported{result.orders.skipped ? `, ${result.orders.skipped} already here` : ""}</li>
            <li>Tasks: {result.tasks.imported} imported{result.tasks.skipped ? `, ${result.tasks.skipped} already here` : ""}</li>
            {result.clientUpdates > 0 && <li>{result.clientUpdates} client message draft(s) kept from the diary</li>}
            {result.unverifiedHearings > 0 && <li>{result.unverifiedHearings} hearing date(s) still need verifying (see Dashboard)</li>}
            {result.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </Notice>
      )}
    </div>
  );
}
