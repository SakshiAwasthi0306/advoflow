"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Copy, X, XCircle } from "lucide-react";

// ---- Toasts -------------------------------------------------------------------
type ToastT = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: ToastT["tone"]) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((text: string, tone: ToastT["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role="status" className={`flex items-start gap-2 rounded-lg border bg-surface px-3 py-2.5 text-sm shadow-lg ${t.tone === "ok" ? "border-ok-line" : "border-danger-line"}`}>
            {t.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-ok" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 text-danger" aria-hidden />}
            <span className="flex-1">{t.text}</span>
            <button aria-label="Dismiss" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))}><X className="h-4 w-4 text-muted" /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---- API helper -------------------------------------------------------------------
export async function api<T = unknown>(url: string, method = "POST", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/** A button that calls the API, shows a toast and refreshes server data. */
export function ActionButton({
  url, method = "POST", body, children, className = "btn-secondary btn-sm", success, confirmText, onDone, disabled,
}: {
  url: string; method?: string; body?: unknown; children: ReactNode; className?: string; success?: string; confirmText?: string;
  onDone?: (data: unknown) => void; disabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      disabled={busy || disabled}
      aria-busy={busy}
      onClick={async () => {
        if (confirmText && !armed) { setArmed(true); return; }
        setArmed(false);
        setBusy(true);
        try {
          const data = await api(url, method, body);
          if (success) toast(success);
          onDone?.(data);
          router.refresh();
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Working…" : armed ? confirmText : children}
    </button>
  );
}

export function CopyButton({ text, label = "Copy", className = "btn-secondary btn-sm" }: { text: string; label?: string; className?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast("Copied to clipboard");
        } catch {
          toast("Couldn't copy automatically. Select the text and copy it.", "error");
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  );
}

// ---- Dialog -------------------------------------------------------------------
export function Dialog({ trigger, title, children, triggerClass = "btn-primary" }: { trigger: ReactNode; title: string; children: (close: () => void) => ReactNode; triggerClass?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button type="button" className={triggerClass} onClick={() => setOpen(true)}>{trigger}</button>
      <dialog ref={ref} onClose={() => setOpen(false)} className="w-[min(94vw,560px)] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-navy-950/40">
        {open && (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button aria-label="Close" onClick={() => setOpen(false)} className="btn-ghost btn-sm"><X className="h-4 w-4" /></button>
            </div>
            {children(() => setOpen(false))}
          </div>
        )}
      </dialog>
    </>
  );
}
