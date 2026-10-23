"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

export interface RevealFact { key: string; label: string; value: string; source: string }

/** Find a quoted passage in the order, tolerating differences in spacing and line breaks. */
function locate(text: string, quote: string): [number, number] | null {
  const words = quote.trim().split(/\s+/).filter(Boolean).slice(0, 40);
  if (!words.length) return null;
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");
  const m = re.exec(text);
  return m ? [m.index, m.index + m[0].length] : null;
}

/**
 * The order's text with every fact the reader found highlighted where it appears. The first time a draft is
 * opened, the highlights light up one by one and each matching field on the right glows in the same order.
 * Hovering a field shows its passage; clicking a highlight jumps to its field.
 */
export function OrderReveal({ jobId, text, facts, play }: { jobId: string; text: string; facts: RevealFact[]; play: boolean }) {
  const box = useRef<HTMLPreElement>(null);
  const [found, setFound] = useState(0);
  const [live, setLive] = useState(false);

  const parts = useMemo(() => {
    const spans: { start: number; end: number; f: RevealFact; i: number }[] = [];
    facts.forEach((f) => {
      const at = locate(text, f.source);
      if (at && !spans.some((s) => at[0] < s.end && at[1] > s.start)) spans.push({ start: at[0], end: at[1], f, i: 0 });
    });
    spans.sort((a, b) => a.start - b.start).forEach((s, i) => (s.i = i));
    return spans;
  }, [text, facts]);
  const order = useMemo(() => [...parts].sort((a, b) => a.start - b.start).map((p) => p.f.key), [parts]);

  useEffect(() => {
    const key = `af-revealed:${jobId}`;
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; } catch { /* fine */ }
    if (!play || seen || !parts.length || matchMedia("(prefers-reduced-motion: reduce)").matches) { setFound(parts.length); setLive(false); return; }
    setLive(true);
    const html = document.documentElement;
    html.classList.add("af-revealing");
    order.forEach((k, i) => document.querySelectorAll(`[data-field="${k}"]`).forEach((el) => (el as HTMLElement).style.setProperty("--rv-i", String(i))));
    const timers = parts.map((_, i) => window.setTimeout(() => setFound(i + 1), 700 + i * 520));
    // Remembered only once it has played through, so it plays once per browser tab session.
    timers.push(window.setTimeout(() => { html.classList.remove("af-revealing"); setLive(false); try { sessionStorage.setItem(key, "1"); } catch { /* fine */ } }, 900 + parts.length * 520 + 900));
    return () => { timers.forEach(clearTimeout); html.classList.remove("af-revealing"); };
  }, [jobId, play, parts, order]);

  // Two-way link between highlights and fields.
  useEffect(() => {
    const on = (e: Event) => {
      const k = (e.currentTarget as HTMLElement).dataset.field;
      box.current?.querySelectorAll(`mark[data-field="${k}"]`).forEach((m) => { m.classList.add("rv-hot"); if (e.type === "mouseenter") m.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
    };
    const off = () => box.current?.querySelectorAll("mark.rv-hot").forEach((m) => m.classList.remove("rv-hot"));
    const rows = document.querySelectorAll<HTMLElement>("[data-field]:not(mark)");
    rows.forEach((r) => { r.addEventListener("mouseenter", on); r.addEventListener("mouseleave", off); });
    return () => rows.forEach((r) => { r.removeEventListener("mouseenter", on); r.removeEventListener("mouseleave", off); });
  }, [parts]);

  const jump = (k: string) => {
    const row = document.querySelector<HTMLElement>(`[data-field="${k}"]:not(mark)`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.remove("rv-ping"); void row.offsetWidth; row.classList.add("rv-ping");
  };

  let cursor = 0;
  const nodes: React.ReactNode[] = [];
  for (const p of parts) {
    if (p.start > cursor) nodes.push(text.slice(cursor, p.start));
    nodes.push(
      <mark key={p.f.key} data-field={p.f.key} title={`${p.f.label}: ${p.f.value}`} onClick={() => jump(p.f.key)} className={`rv-mark ${p.i < found ? "rv-on" : ""}`}>
        {text.slice(p.start, p.end)}
        {live && p.i === found - 1 && <span className="rv-tag" aria-hidden>{p.f.label} → {p.f.value}</span>}
      </mark>,
    );
    cursor = p.end;
  }
  nodes.push(text.slice(cursor));

  return (
    <>
      {parts.length > 0 && (
        <div className={`mb-2 flex items-center gap-2 text-xs ${live ? "text-ai" : "text-muted"}`} aria-live="polite">
          <Sparkles className={`h-3.5 w-3.5 ${live ? "animate-pulse" : ""}`} aria-hidden />
          {live ? `Reading… found ${found} of ${parts.length}` : `${parts.length} facts found in the text. Point at a field to see where it came from; click a highlight to jump to its field.`}
        </div>
      )}
      <pre ref={box} className={`max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-3 font-mono text-[12.5px] leading-relaxed ${live ? "rv-scan" : ""}`}>{nodes}</pre>
    </>
  );
}
