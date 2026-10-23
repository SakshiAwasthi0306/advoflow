"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Briefcase, CalendarClock, ListChecks } from "lucide-react";

// Series colours, as token expressions so they follow light and dark themes.
const SERIES = ["rgb(var(--c-accent))", "rgb(var(--c-ai))", "rgb(124 112 240)", "rgb(var(--c-warn))", "rgb(var(--c-ok))", "rgb(var(--c-danger))", "rgb(var(--c-neutral))"];

function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t); }, []);
  return on;
}

function useCount(target: number, ms = 1000) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    const t0 = performance.now();
    let f = 0;
    const step = (now: number) => { const p = Math.min(1, (now - t0) / ms); setV(Math.round((1 - Math.pow(1 - p, 3)) * target)); if (p < 1) f = requestAnimationFrame(step); };
    f = requestAnimationFrame(step);
    return () => cancelAnimationFrame(f);
  }, [target, ms]);
  return v;
}

/* ---------- Headline tiles ---------- */

export interface Tile { key: "cases" | "hearings" | "tasks" | "overdue"; label: string; value: number; ratio: number; note: string; href?: string }
const TILE_STYLE = {
  cases: { icon: Briefcase, color: "rgb(var(--c-accent))" },
  hearings: { icon: CalendarClock, color: "rgb(var(--c-ai))" },
  tasks: { icon: ListChecks, color: "rgb(124 112 240)" },
  overdue: { icon: AlertTriangle, color: "rgb(var(--c-danger))" },
};

function Ring({ ratio, color, on }: { ratio: number; color: string; on: boolean }) {
  const c = 2 * Math.PI * 22;
  return (
    <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" aria-hidden>
      <circle cx="28" cy="28" r="22" fill="none" stroke="rgb(var(--c-line))" strokeWidth="6" />
      <circle cx="28" cy="28" r="22" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={on ? c * (1 - Math.max(0, Math.min(1, ratio))) : c} style={{ transition: "stroke-dashoffset 1200ms cubic-bezier(.2,.8,.2,1)" }} />
    </svg>
  );
}

function TileCard({ t, i, on }: { t: Tile; i: number; on: boolean }) {
  const n = useCount(t.value);
  const { icon: I, color } = TILE_STYLE[t.key];
  const hot = t.key === "overdue" && t.value > 0;
  const body = (
    <div className="rx-tile card group relative h-full overflow-hidden p-4" style={{ "--rx-c": color, animationDelay: `${i * 70}ms` } as React.CSSProperties}>
      <span aria-hidden className="rx-tile-glow" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted"><I className="h-3.5 w-3.5" style={{ color }} aria-hidden />{t.label}</div>
          <div className={`display num mt-1.5 text-[34px] font-semibold leading-none ${hot ? "text-danger" : ""}`}>{n}</div>
          <div className="mt-2 text-[12px] text-muted">{t.note}</div>
        </div>
        <Ring ratio={t.ratio} color={color} on={on} />
      </div>
      {hot && <span aria-hidden className="rx-alarm" />}
    </div>
  );
  return t.href ? <Link href={t.href} className="block h-full rounded-lg">{body}</Link> : body;
}

export function PulseTiles({ tiles }: { tiles: Tile[] }) {
  const on = useMounted();
  return <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">{tiles.map((t, i) => <TileCard key={t.key} t={t} i={i} on={on} />)}</div>;
}

/* ---------- The next 30 days, as a river of hearings and deadlines ---------- */

export interface RiverDay { date: string; day: number; dow: string; month: string; weekend: boolean; label: string; hearings: { caseId: string; caseNumber: string; title: string; confirmed: boolean }[]; tasks: { caseId: string; caseNumber: string; title: string }[] }

export function HearingRiver({ days }: { days: RiverDay[] }) {
  const on = useMounted();
  const max = Math.max(1, ...days.map((d) => d.hearings.length + d.tasks.length));
  const first = Math.max(0, days.findIndex((d) => d.hearings.length + d.tasks.length > 0));
  const [sel, setSel] = useState(first);
  const d = days[sel];
  const totals = useMemo(() => ({ h: days.reduce((n, x) => n + x.hearings.length, 0), t: days.reduce((n, x) => n + x.tasks.length, 0) }), [days]);
  return (
    <section className="card rx-river mb-5 p-4 sm:p-5" aria-labelledby="river-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="river-title" className="text-[15px] font-semibold">The next 30 days</h2>
          <p className="text-xs text-muted">{totals.h} hearing{totals.h === 1 ? "" : "s"} and {totals.t} deadline{totals.t === 1 ? "" : "s"}. Point at or tap a day to see what is on it.</p>
        </div>
        <div className="flex gap-3 text-xs text-muted"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "linear-gradient(rgb(var(--c-accent)), rgb(var(--c-ai)))" }} />Hearing</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warn" />Deadline</span></div>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-[640px] items-end gap-[3px]" role="listbox" aria-label="Days" style={{ height: 150 }}>
          {days.map((x, i) => {
            const h = x.hearings.length, t = x.tasks.length;
            const active = i === sel;
            return (
              <button
                key={x.date}
                type="button"
                role="option"
                aria-selected={active}
                aria-label={`${x.label}: ${h} hearing${h === 1 ? "" : "s"}, ${t} deadline${t === 1 ? "" : "s"}`}
                onMouseEnter={() => setSel(i)}
                onFocus={() => setSel(i)}
                onClick={() => setSel(i)}
                className={`rx-col group relative flex h-full flex-1 flex-col items-center justify-end rounded-md pb-5 ${active ? "rx-col-on" : ""} ${x.weekend ? "rx-weekend" : ""}`}
              >
                <span className="flex w-full flex-col-reverse items-stretch gap-[2px] px-[2px]">
                  {h > 0 && <span className="rx-bar rounded-[3px]" style={{ height: `${(h / max) * 100}px`, background: "linear-gradient(to top, rgb(var(--c-accent)), rgb(var(--c-ai)))", transform: on ? "scaleY(1)" : "scaleY(0)", transitionDelay: `${i * 22}ms` }} />}
                  {t > 0 && <span className="rx-bar rounded-[3px] bg-warn" style={{ height: `${(t / max) * 100}px`, transform: on ? "scaleY(1)" : "scaleY(0)", transitionDelay: `${i * 22 + 80}ms` }} />}
                  {h + t === 0 && <span className="mx-auto h-1 w-1 rounded-full bg-line" />}
                </span>
                <span className={`absolute bottom-0 text-[10px] tabular-nums ${i === 0 ? "font-bold text-accent" : "text-muted"}`}>{x.day}</span>
                {(i === 0 || x.day === 1) && <span className="absolute -top-0 left-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted">{x.month}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div key={d.date} className="animate-fade mt-3 rounded-lg border border-line bg-paper/60 p-3">
        <div className="mb-1.5 text-[13px] font-semibold">{d.label}{sel === 0 && <span className="ml-2 rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-surface">Today</span>}</div>
        {d.hearings.length + d.tasks.length === 0 ? <p className="text-sm text-muted">Nothing listed. A clear day.</p> : (
          <ul className="flex flex-wrap gap-2">
            {d.hearings.map((h, k) => <li key={`h${k}`}><Link href={`/cases/${h.caseId}`} className="rx-pill inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[12.5px]"><span className={`h-1.5 w-1.5 rounded-full ${h.confirmed ? "bg-accent" : "border border-accent bg-transparent"}`} /><span className="ref whitespace-nowrap font-medium">{h.caseNumber}</span><span className="max-w-[16rem] truncate text-muted">{h.title}{h.confirmed ? "" : " · unconfirmed"}</span></Link></li>)}
            {d.tasks.map((t, k) => <li key={`t${k}`}><Link href={`/cases/${t.caseId}?tab=tasks`} className="rx-pill inline-flex items-center gap-1.5 rounded-full border border-warn-line bg-warn-soft px-2.5 py-1 text-[12.5px]"><span className="h-1.5 w-1.5 rounded-full bg-warn" /><span className="ref whitespace-nowrap font-medium">{t.caseNumber}</span><span className="max-w-[16rem] truncate text-muted">{t.title}</span></Link></li>)}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ---------- Cases by stage, as a donut ---------- */

export function StageDonut({ data }: { data: { label: string; n: number }[] }) {
  const on = useMounted();
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, x) => s + x.n, 0) || 1;
  const r = 62, c = 2 * Math.PI * r, gap = data.length > 1 ? 3 : 0;
  let acc = 0;
  const segs = data.map((x, i) => { const len = (x.n / total) * c; const s = { ...x, i, start: acc, len }; acc += len; return s; });
  const focus = hover === null ? null : data[hover];
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="stage-title">
      <h2 id="stage-title" className="mb-3 text-[15px] font-semibold">Cases by procedural stage</h2>
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-[168px] w-[168px] shrink-0">
          <svg viewBox="0 0 168 168" className="h-full w-full -rotate-90" role="img" aria-label={data.map((x) => `${x.label}: ${x.n}`).join(", ")}>
            <circle cx="84" cy="84" r={r} fill="none" stroke="rgb(var(--c-line))" strokeWidth="20" />
            {segs.map((s) => (
              <circle
                key={s.label} cx="84" cy="84" r={r} fill="none" stroke={SERIES[s.i % SERIES.length]} strokeWidth={hover === s.i ? 26 : 20}
                strokeDasharray={`${on ? Math.max(0, s.len - gap) : 0} ${c}`} strokeDashoffset={-s.start}
                style={{ transition: `stroke-dasharray 1000ms cubic-bezier(.2,.8,.2,1) ${s.i * 120}ms, stroke-width 200ms, opacity 200ms`, opacity: hover === null || hover === s.i ? 1 : 0.3, cursor: "pointer" }}
                onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div key={hover ?? -1} className="animate-fade">
              <div className="display num text-[30px] font-semibold leading-none">{focus ? focus.n : total}</div>
              <div className="mt-1 max-w-[96px] text-[11px] leading-tight text-muted">{focus ? focus.label : "active cases"}</div>
            </div>
          </div>
        </div>
        <ul className="w-full min-w-0 space-y-1">
          {data.map((x, i) => (
            <li key={x.label}>
              <button type="button" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${hover === i ? "bg-navy-50" : ""}`}>
                <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: SERIES[i % SERIES.length] }} />
                <span className="min-w-0 flex-1 truncate" title={x.label}>{x.label}</span>
                <span className="num font-semibold">{x.n}</span>
                <span className="num w-10 text-right text-xs text-muted">{Math.round((x.n / total) * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Ranked bars (adjournments, open tasks) ---------- */

export function RankBars({ title, rows, tone, unit, empty }: { title: string; rows: { label: string; href: string; n: number }[]; tone: "violet" | "warn"; unit: string; empty: string }) {
  const on = useMounted();
  const max = Math.max(1, ...rows.map((r) => r.n));
  const fill = tone === "violet" ? "linear-gradient(90deg, rgb(124 112 240), rgb(var(--c-accent)))" : "linear-gradient(90deg, rgb(var(--c-warn)), rgb(240 140 60))";
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <ul className="space-y-2.5">
          {rows.slice(0, 8).map((r, i) => (
            <li key={r.label}>
              <Link href={r.href} className="rx-rank group block rounded-md text-sm">
                <span className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="ref min-w-0 truncate font-medium group-hover:text-accent">{r.label}</span>
                  <span className="num shrink-0 text-xs text-muted"><b className="text-[13px] text-ink">{r.n}</b> {unit}</span>
                </span>
                <span className="relative block h-2.5 overflow-hidden rounded-full bg-line/70">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: on ? `${Math.max(4, (r.n / max) * 100)}%` : "0%", background: fill, transition: `width 1000ms cubic-bezier(.2,.8,.2,1) ${i * 90}ms` }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
