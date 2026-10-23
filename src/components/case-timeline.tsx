import { formatDate } from "@/lib/dates";
import type { CaseRecord, CourtOrder, DateChange, Hearing } from "@/lib/types";

type Ev = { date: string; kind: "opened" | "order" | "adjourned" | "hearing" | "held" | "moved" | "next" | "unconfirmed"; title: string; sub: string };

const DOT: Record<Ev["kind"], string> = {
  opened: "bg-muted", order: "bg-navy-900", adjourned: "bg-warn", hearing: "bg-accent", held: "bg-ok", moved: "bg-[rgb(124_112_240)]", next: "bg-accent", unconfirmed: "border-2 border-dashed border-accent bg-surface",
};

/** The life of a case on one line: when it opened, every order and adjournment, hearings held, dates moved, and what is next. */
export function CaseTimeline({ c, orders, hearings, changes, nextHearing, today }: { c: CaseRecord; orders: CourtOrder[]; hearings: Hearing[]; changes: DateChange[]; nextHearing: Hearing | null; today: string }) {
  const ev: Ev[] = [{ date: c.createdAt.slice(0, 10), kind: "opened", title: "Case added", sub: "to AdvoFlow" }];
  for (const o of orders) if (o.orderDate) ev.push({ date: o.orderDate, kind: o.adjourned ? "adjourned" : "order", title: o.adjourned ? "Adjourned" : "Order", sub: (o.summary || o.stage || "").slice(0, 70) });
  for (const h of hearings) {
    if (h.status === "superseded" || h.status === "cancelled" || h.id === nextHearing?.id) continue;
    if (h.date < today) ev.push({ date: h.date, kind: "held", title: "Hearing", sub: h.purpose || "" });
  }
  for (const d of changes) ev.push({ date: d.at.slice(0, 10), kind: "moved", title: "Date moved", sub: `${formatDate(d.from)} → ${formatDate(d.to)}` });
  if (nextHearing && nextHearing.date >= today) ev.push({ date: nextHearing.date, kind: nextHearing.status === "confirmed" ? "next" : "unconfirmed", title: "Next hearing", sub: [nextHearing.status === "confirmed" ? "" : "Awaiting your confirmation", nextHearing.purpose].filter(Boolean).join(" · ") });
  ev.sort((a, b) => a.date.localeCompare(b.date));
  if (ev.length < 2) return null;

  const t = (d: string) => Date.parse(d + "T00:00:00Z");
  const min = t(ev[0].date);
  const max = Math.max(t(ev[ev.length - 1].date), t(today));
  const span = Math.max(1, max - min);
  const pos = (d: string) => 7 + ((t(d) - min) / span) * 86;
  const todayAt = pos(today);
  const adjourned = orders.filter((o) => o.adjourned).length;
  // Place each label above or below its dot; when both sides are crowded, the dot keeps its details in the tooltip only.
  const lastAt = { up: -100, down: -100 };
  const place = ev.map((e) => {
    const x = pos(e.date);
    const side = x - lastAt.up >= 11 ? "up" : x - lastAt.down >= 11 ? "down" : null;
    if (side) lastAt[side] = x;
    return side;
  });

  return (
    <section className="card mb-5 p-4 sm:p-5" aria-label="Case timeline">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Timeline</h2>
        <span className="text-xs text-muted">{orders.length} order{orders.length === 1 ? "" : "s"} · {adjourned} adjournment{adjourned === 1 ? "" : "s"} · {Math.round((max - min) / 864e5)} days</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="relative h-[118px] min-w-[640px]">
          <div className="tl-track absolute left-[2%] right-[2%] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line" />
          <div className="tl-fill absolute left-[2%] top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ width: `${Math.max(0, todayAt - 2)}%` }} />
          <div className="absolute top-[18%] bottom-[18%] w-px bg-accent/40" style={{ left: `${todayAt}%` }}><span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-accent">Today</span></div>
          {ev.map((e, i) => {
            const side = place[i];
            const up = side !== "down";
            return (
              <div key={i} className="tl-ev group absolute top-1/2" style={{ left: `${pos(e.date)}%`, animationDelay: `${i * 70}ms` }}>
                <span tabIndex={0} aria-label={`${formatDate(e.date)}: ${e.title}${e.sub ? `, ${e.sub}` : ""}`} className={`tl-dot absolute block h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-surface ${DOT[e.kind]} ${e.kind === "next" || e.kind === "unconfirmed" ? "tl-next" : ""}`} />
                {side && <span className={`absolute -translate-x-1/2 whitespace-nowrap text-center ${up ? "bottom-3" : "top-3"}`}>
                  <span className="block text-[10.5px] font-semibold leading-tight">{e.title}</span>
                  <span className="num block text-[10px] leading-tight text-muted">{formatDate(e.date).replace(/ (\d{4})$/, " ’$1").replace(/’20/, "’")}</span>
                </span>}
                {(e.sub || !side) && <span className="tl-tip card-raised pointer-events-none absolute left-1/2 z-10 w-max max-w-[240px] -translate-x-1/2 px-2.5 py-1.5 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" style={{ [up ? "top" : "bottom"]: 14 }}>{!side && <b className="block">{e.title} · {formatDate(e.date)}</b>}{e.sub}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
