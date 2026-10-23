"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, PenLine } from "lucide-react";
import { api, useToast } from "./client";

interface Result { name: string; jobId: string | null; status: string; reused: boolean; message: string }
const MAX = 15 * 1024 * 1024;
const OK_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain"];
// The hosting platform rejects request bodies over ~4.5 MB, so one upload stays under this.
const SEND_LIMIT = 4 * 1024 * 1024;

/** Phone photos are often 3–8 MB; re-encode large ones at a size that still reads clearly. */
async function shrinkPhoto(f: File): Promise<File> {
  if (!/^image\/(png|jpeg)$/.test(f.type) || f.size < 1.5 * 1024 * 1024) return f;
  try {
    const img = await createImageBitmap(f);
    const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.png$/i, ".jpg"), { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

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

  async function pick(list: FileList | null) {
    const errs: string[] = [];
    const ok: File[] = [];
    for (const original of Array.from(list ?? [])) {
      const f = await shrinkPhoto(original);
      if (!OK_TYPES.includes(f.type) && !/\.(pdf|png|jpe?g|txt)$/i.test(f.name)) errs.push(`${f.name}: use PDF, JPG, PNG or .txt`);
      else if (f.size > MAX) errs.push(`${f.name}: larger than 15 MB`);
      else if (f.size > SEND_LIMIT) errs.push(`${f.name}: larger than 4 MB. Upload fewer pages, or a smaller scan.`);
      else ok.push(f);
    }
    setErrors(errs);
    setFiles(ok);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !files.length) { setErrors(["Paste an order or choose at least one file."]); return; }
    if (files.reduce((n, f) => n + f.size, 0) > SEND_LIMIT) { setErrors(["These files are more than 4 MB together. Upload them a few at a time."]); return; }
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
        <label htmlFor="u-files" className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-line bg-surface px-4 py-6 text-center hover:border-navy-700/40">
          <FileUp className="mb-1 h-6 w-6 text-muted" aria-hidden />
          <span className="text-sm font-medium">Choose PDFs, photos (JPG, PNG) or .txt files</span>
          <span className="text-xs text-muted">Up to 4 MB per upload; large photos are shrunk automatically. Downloaded eCourts PDFs work best.</span>
          <input ref={fileRef} id="u-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" className="sr-only" onChange={(e) => void pick(e.target.files)} />
        </label>
        {files.length > 0 && <ul className="mt-2 text-sm text-muted">{files.map((f) => <li key={f.name}>{f.name} · {(f.size / 1024).toFixed(0)} KB</li>)}</ul>}
      </div>
      {errors.length > 0 && <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
      <button className="btn-primary" disabled={busy}>{busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading…</> : "Extract order details"}</button>
      {busy && <Reading />}
      {results && (
        <div className="animate-rise space-y-2" aria-live="polite">
          {results.map((r, i) => {
            const failed = r.status === "error" || r.status === "failed";
            return (
              <div key={i} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${failed ? "rounded-[10px] border border-danger-line bg-danger-soft/50" : r.status === "approved" ? "card" : "ai-draft"}`}>
                {!failed && r.status !== "approved" && <span className="ai-chip"><PenLine className="h-3 w-3" aria-hidden />Draft ready</span>}
                <span className="font-medium">{r.name}</span>
                <span className={failed ? "text-danger" : "text-muted"}>{r.status === "needs_review" && !r.reused ? "Check each detail against the original. Nothing is saved until you confirm." : r.message}</span>
                {r.jobId && <Link className={`${failed ? "btn-secondary" : "btn-primary"} btn-sm ml-auto`} href={`/review/${r.jobId}`}>{r.status === "approved" ? "View" : failed ? "Enter manually" : "Check the draft"}</Link>}
              </div>
            );
          })}
        </div>
      )}
    </form>
  );
}

/** While an order is being read: honest steps (no fake progress percentages) and a calm placeholder. */
function Reading() {
  const steps = ["Reading the order…", "Finding the dates, directions and parties…", "Checking every date against the order's own words…"];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 2600); return () => clearInterval(t); }, [steps.length]);
  return (
    <div className="ai-draft animate-fade p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm font-medium text-ai"><PenLine className="h-4 w-4" aria-hidden />{steps[i]}</div>
      <div className="mt-3 space-y-2" aria-hidden><div className="skeleton h-2.5 w-3/4" /><div className="skeleton h-2.5 w-1/2" /><div className="skeleton h-2.5 w-2/3" /></div>
      <p className="mt-3 text-xs text-muted">Usually under a minute. Scans and photos take a little longer.</p>
    </div>
  );
}
