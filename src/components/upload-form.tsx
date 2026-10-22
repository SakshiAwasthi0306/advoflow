"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { api, useToast } from "./client";

interface Result { name: string; jobId: string | null; status: string; reused: boolean; message: string }
const MAX = 15 * 1024 * 1024;
const OK_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain"];

export function UploadForm({ defaultCase, sample }: { defaultCase: string; sample: string }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [caseNumber, setCaseNumber] = useState(defaultCase);
  const [court, setCourt] = useState("");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function pick(list: FileList | null) {
    const errs: string[] = [];
    const ok: File[] = [];
    for (const f of Array.from(list ?? [])) {
      if (!OK_TYPES.includes(f.type) && !/\.(pdf|png|jpe?g|txt)$/i.test(f.name)) errs.push(`${f.name}: use PDF, JPG, PNG or .txt`);
      else if (f.size > MAX) errs.push(`${f.name}: larger than 15 MB`);
      else ok.push(f);
    }
    setErrors(errs);
    setFiles(ok);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !files.length) { setErrors(["Paste an order or choose at least one file."]); return; }
    setBusy(true);
    setResults(null);
    const fd = new FormData();
    fd.set("text", text);
    fd.set("caseNumber", caseNumber);
    fd.set("court", court);
    fd.set("context", context);
    files.forEach((f) => fd.append("files", f));
    try {
      const r = await api<{ results: Result[] }>("/api/orders/process", "POST", fd);
      setResults(r.results);
      const ok = r.results.filter((x) => x.jobId).length;
      toast(`${ok} of ${r.results.length} processed`, ok ? "ok" : "error");
      if (ok) { setText(""); setFiles([]); if (fileRef.current) fileRef.current.value = ""; }
      router.refresh();
    } catch (ex) {
      setErrors([(ex as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="u-case">Case number (optional)</label><input id="u-case" className="input" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} placeholder="O.S. 482/2025" /></div>
        <div><label className="label" htmlFor="u-court">Court (optional)</label><input id="u-court" className="input" value={court} onChange={(e) => setCourt(e.target.value)} /></div>
        <div><label className="label" htmlFor="u-ctx">Additional context (optional)</label><input id="u-ctx" className="input" value={context} onChange={(e) => setContext(e.target.value)} placeholder="e.g. we act for the plaintiff" /></div>
      </div>
      <div>
        <div className="flex items-center justify-between"><label className="label" htmlFor="u-text">Paste order text (English or Kannada)</label><button type="button" className="btn-ghost btn-sm" onClick={() => setText(sample)}>Insert a sample order</button></div>
        <textarea id="u-text" lang="en" className="input min-h-[160px] font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Paste the order here.\nSeveral orders at once? Put a line with --- between them."} />
      </div>
      <div>
        <label className="label" htmlFor="u-files">Or upload files</label>
        <label htmlFor="u-files" className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-line bg-white px-4 py-6 text-center hover:border-navy-700/40">
          <FileUp className="mb-1 h-6 w-6 text-muted" aria-hidden />
          <span className="text-sm font-medium">Choose PDFs, photos (JPG, PNG) or .txt files</span>
          <span className="text-xs text-muted">Up to 20 files, 15 MB each. Downloaded eCourts PDFs work best.</span>
          <input ref={fileRef} id="u-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" className="sr-only" onChange={(e) => pick(e.target.files)} />
        </label>
        {files.length > 0 && <ul className="mt-2 text-sm text-muted">{files.map((f) => <li key={f.name}>{f.name} · {(f.size / 1024).toFixed(0)} KB</li>)}</ul>}
      </div>
      {errors.length > 0 && <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      <button className="btn-primary" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading orders…</> : "Read orders"}</button>
      {results && (
        <div className="card p-3" aria-live="polite">
          <h3 className="mb-2 text-sm font-semibold">Results</h3>
          <ul className="divide-y divide-line text-sm">
            {results.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{r.name}</span>
                <span className={r.status === "error" || r.status === "failed" ? "text-danger" : "text-muted"}>{r.message}</span>
                {r.jobId && <Link className="btn-primary btn-sm ml-auto" href={`/review/${r.jobId}`}>{r.status === "approved" ? "View" : r.status === "failed" ? "Enter manually" : "Review and confirm"}</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
