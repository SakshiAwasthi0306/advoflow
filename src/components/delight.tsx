"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BarChart3, BookOpen, CalendarDays, CalendarRange, CornerDownLeft, FileText, LayoutDashboard, ListChecks, NotebookTabs, Plus, Search, Settings, Upload, User, Users, Volume2 } from "lucide-react";
import { play, setSoundOn, soundOn } from "@/lib/sound";

export interface PeekCase { id: string; number: string; title: string; court: string; stage: string; next: { date: string; label: string; confirmed: boolean } | null; open: number; overdue: number }

/* ---------- Command palette (Cmd/Ctrl + K) ---------- */

type Cmd = { id: string; label: string; hint?: string; group: "Go to" | "Do" | "Cases"; href: string; icon: typeof Search; keywords?: string };

const BASE: Cmd[] = [
  { id: "today", label: "Today", group: "Go to", href: "/", icon: LayoutDashboard, keywords: "home dashboard" },
  { id: "cases", label: "Case diary", group: "Go to", href: "/cases", icon: NotebookTabs, keywords: "matters" },
  { id: "hearings", label: "Hearings calendar", group: "Go to", href: "/calendar", icon: CalendarDays, keywords: "dates court" },
  { id: "tasks", label: "Tasks", group: "Go to", href: "/tasks", icon: ListChecks, keywords: "todo" },
  { id: "clients", label: "Clients", group: "Go to", href: "/clients", icon: Users },
  { id: "orders", label: "Court orders", group: "Go to", href: "/upload", icon: FileText, keywords: "review drafts" },
  { id: "research", label: "Legal research", group: "Go to", href: "/research", icon: BookOpen, keywords: "judgments law" },
  { id: "reports", label: "Reports", group: "Go to", href: "/reports", icon: BarChart3, keywords: "stats" },
  { id: "settings", label: "Settings", group: "Go to", href: "/settings", icon: Settings, keywords: "sound" },
  { id: "profile", label: "My profile", group: "Go to", href: "/profile", icon: User },
  { id: "record", label: "Record a court order", group: "Do", href: "/upload", icon: Upload, keywords: "upload pdf photo" },
  { id: "addtask", label: "Add a task", group: "Do", href: "/tasks", icon: Plus, keywords: "new task" },
  { id: "addcase", label: "Add a case", group: "Do", href: "/cases/new", icon: Plus, keywords: "new case" },
  { id: "week", label: "This week's hearings", group: "Do", href: "/calendar?view=week", icon: CalendarRange, keywords: "week" },
];

function istDate(offset: number) {
  const d = new Date(Date.now() + 5.5 * 3600e3 + offset * 86400e3);
  return d.toISOString().slice(0, 10);
}

export function CommandPalette({ cases }: { cases: PeekCase[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const o = () => setOpen(true);
    document.addEventListener("keydown", k);
    window.addEventListener("af-palette", o);
    return () => { document.removeEventListener("keydown", k); window.removeEventListener("af-palette", o); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setSel(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);

  const results = useMemo(() => {
    const all: Cmd[] = [
      ...BASE,
      { id: "tomorrow", label: "Tomorrow's hearings", group: "Do", href: `/calendar?view=agenda&d=${istDate(1)}`, icon: CalendarDays, keywords: "tomorrow" },
      ...cases.map((c) => ({ id: c.id, label: c.number, hint: [c.title, c.court].filter(Boolean).join(" · "), group: "Cases" as const, href: `/cases/${c.id}`, icon: NotebookTabs, keywords: `${c.title} ${c.court} ${c.stage}` })),
    ];
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return all.filter((c) => c.group !== "Cases").concat(all.filter((c) => c.group === "Cases").slice(0, 5));
    return all.filter((c) => { const hay = `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""}`.toLowerCase(); return terms.every((t) => hay.includes(t)); }).slice(0, 30);
  }, [q, cases]);

  useEffect(() => { list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const go = (c: Cmd | undefined) => { if (!c) return; setOpen(false); router.push(c.href); };

  if (!open) return null;
  let last = "";
  return (
    <div className="no-print fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="kp-backdrop absolute inset-0 bg-navy-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="kp-panel card-raised relative w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search className="h-[18px] w-[18px] text-accent" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              if (e.key === "Enter") { e.preventDefault(); go(results[sel]); }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Type a case number, a page or an action…"
            aria-label="Search commands and cases"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] text-muted">Esc</kbd>
        </div>
        <ul ref={list} className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{q}”.</li>}
          {results.map((c, i) => {
            const head = c.group !== last ? (last = c.group) : null;
            return (
              <li key={c.group + c.id} role="presentation">
                {head && <div className="kicker px-3 pb-1 pt-2.5 !text-[10px]">{head}</div>}
                <button
                  type="button" role="option" aria-selected={i === sel} data-i={i}
                  onMouseMove={() => setSel(i)} onClick={() => go(c)}
                  className={`kp-item flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === sel ? "kp-on" : ""}`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-navy-50 text-navy-800"><c.icon className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1"><span className={c.group === "Cases" ? "ref font-medium" : "font-medium"}>{c.label}</span>{c.hint && <span className="block truncate text-xs text-muted">{c.hint}</span>}</span>
                  {i === sel ? <CornerDownLeft className="h-4 w-4 text-accent" aria-hidden /> : <ArrowRight className="h-4 w-4 text-muted/50" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-4 border-t border-line bg-paper/60 px-4 py-2 text-[11px] text-muted"><span>↑ ↓ to move</span><span>↵ to open</span><span className="ml-auto">⌘K / Ctrl K anywhere</span></div>
      </div>
    </div>
  );
}

/* ---------- Hover a case number anywhere for a quick look ---------- */

export function CasePeek({ cases }: { cases: PeekCase[] }) {
  const path = usePathname();
  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const [peek, setPeek] = useState<{ c: PeekCase; x: number; y: number; below: boolean } | null>(null);
  useEffect(() => setPeek(null), [path]);
  useEffect(() => {
    let timer = 0;
    let current: Element | null = null;
    const over = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const a = (e.target as Element).closest?.('a[href^="/cases/"]');
      if (a === current) return;
      current = a;
      clearTimeout(timer);
      if (!a || a.closest("nav,[data-no-peek],.theme-sidebar")) { setPeek(null); return; }
      const id = a.getAttribute("href")!.split(/[/?#]/)[2];
      const c = byId.get(id);
      if (!c || window.location.pathname === `/cases/${id}`) { setPeek(null); return; }
      timer = window.setTimeout(() => {
        const r = a.getBoundingClientRect();
        const below = r.top < 260;
        setPeek({ c, x: Math.min(Math.max(12, r.left), window.innerWidth - 332), y: below ? r.bottom + 8 : r.top - 8, below });
      }, 380);
    };
    const hide = () => { clearTimeout(timer); current = null; setPeek(null); };
    document.addEventListener("pointerover", over);
    window.addEventListener("scroll", hide, { passive: true });
    return () => { document.removeEventListener("pointerover", over); window.removeEventListener("scroll", hide); clearTimeout(timer); };
  }, [byId]);
  if (!peek) return null;
  const { c } = peek;
  return (
    <div className="kp-peek card-raised pointer-events-none fixed z-[65] w-[320px] p-3.5" style={{ left: peek.x, top: peek.y, transform: peek.below ? "none" : "translateY(-100%)" }} role="tooltip">
      <div className="flex items-center justify-between gap-2"><span className="ref font-semibold text-navy-900">{c.number}</span>{c.stage && <span className="truncate rounded bg-navy-50 px-1.5 py-0.5 text-[11px] text-navy-800">{c.stage}</span>}</div>
      <div className="mt-1 text-sm font-medium leading-snug">{c.title || "Parties not entered"}</div>
      <div className="truncate text-xs text-muted">{c.court || "Court not entered"}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-center">
        <div><div className={`text-[13px] font-semibold ${c.next ? "text-accent" : "text-muted"}`}>{c.next ? c.next.label : "—"}</div><div className="text-[10.5px] text-muted">{c.next ? (c.next.confirmed ? "next hearing" : "unconfirmed") : "no hearing"}</div></div>
        <div><div className="num text-[13px] font-semibold">{c.open}</div><div className="text-[10.5px] text-muted">open tasks</div></div>
        <div><div className={`num text-[13px] font-semibold ${c.overdue ? "text-danger" : ""}`}>{c.overdue}</div><div className="text-[10.5px] text-muted">overdue</div></div>
      </div>
    </div>
  );
}

/* ---------- Settings: sounds and vibration ---------- */

export function SoundToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(soundOn()), []);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 text-sm"><Volume2 className="h-4 w-4 text-accent" aria-hidden /><span><span className="font-medium">Sounds and vibration</span><span className="block text-xs text-muted">A soft tick when something is saved and a chime when an order is confirmed. Kept in this browser only.</span></span></span>
      <span className="relative inline-flex">
        <input id="sound-toggle" type="checkbox" className="peer sr-only" checked={on} onChange={(e) => { setOn(e.target.checked); setSoundOn(e.target.checked); if (e.target.checked) play("chime", true); }} />
        <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/* ---------- Calendar: drag a deadline to another day ---------- */

export function CalendarDrag() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let dragged: HTMLElement | null = null;
    const cells = () => document.querySelectorAll<HTMLElement>("[data-date]");
    const start = (e: DragEvent) => {
      const el = (e.target as Element).closest?.<HTMLElement>("[data-task]");
      if (!el) return;
      dragged = el;
      el.classList.add("dnd-lift");
      e.dataTransfer?.setData("text/plain", el.dataset.task!);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      document.documentElement.classList.add("dnd-on");
    };
    const over = (e: DragEvent) => {
      const cell = (e.target as Element).closest?.<HTMLElement>("[data-date]");
      if (!dragged || !cell) return;
      e.preventDefault();
      cells().forEach((c) => c.classList.toggle("dnd-target", c === cell));
    };
    const end = () => { dragged?.classList.remove("dnd-lift"); dragged = null; document.documentElement.classList.remove("dnd-on"); cells().forEach((c) => c.classList.remove("dnd-target")); };
    const drop = async (e: DragEvent) => {
      const cell = (e.target as Element).closest?.<HTMLElement>("[data-date]");
      const id = dragged?.dataset.task;
      const from = dragged?.dataset.due;
      end();
      if (!cell || !id) return;
      e.preventDefault();
      const to = cell.dataset.date!;
      if (to === from) return;
      try {
        const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dueDate: to }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not move the deadline");
        play("tick");
        setMsg(`Deadline moved to ${new Date(to + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}`);
        router.refresh();
      } catch (err) {
        play("error");
        setMsg((err as Error).message);
      }
      setTimeout(() => setMsg(null), 3000);
    };
    document.addEventListener("dragstart", start);
    document.addEventListener("dragover", over);
    document.addEventListener("dragend", end);
    document.addEventListener("drop", drop);
    return () => { document.removeEventListener("dragstart", start); document.removeEventListener("dragover", over); document.removeEventListener("dragend", end); document.removeEventListener("drop", drop); };
  }, [router]);
  return msg ? <div role="status" className="animate-rise fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl bg-[rgb(10_37_64)] px-4 py-2.5 text-sm text-white shadow-lift">{msg}</div> : null;
}

/* ---------- Tasks: swipe right to finish, left to push a day (touch screens) ---------- */

export function SwipeTask({ id, dueDate, today, children }: { id: string; dueDate: string | null; today: string; children: React.ReactNode }) {
  const router = useRouter();
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState<"" | "done" | "later">("");
  const start = useRef<{ x: number; y: number; lock: "" | "x" | "y" } | null>(null);
  const LIMIT = 96;
  const base = dueDate && dueDate > today ? dueDate : today;
  const next = new Date(Date.parse(base + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);

  async function act(kind: "done" | "later") {
    setGone(kind);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "done" ? { status: "done" } : { dueDate: next }) });
      if (!res.ok) throw new Error();
      play(kind === "done" ? "chime" : "tick");
      router.refresh();
      // The row stays mounted when it is still listed (a postponed task), so bring it back into place.
      setTimeout(() => { setGone(""); setDx(0); }, 450);
    } catch {
      play("error");
      setGone("");
      setDx(0);
    }
  }

  return (
    <div className="swipe relative overflow-hidden">
      <div aria-hidden className={`absolute inset-0 flex items-center justify-between px-4 text-sm font-semibold ${dx > 0 ? "bg-ok-soft text-ok" : dx < 0 ? "bg-warn-soft text-warn" : ""}`}>
        <span style={{ opacity: Math.min(1, dx / LIMIT) }}>✓ Done</span>
        <span style={{ opacity: Math.min(1, -dx / LIMIT) }}>+1 day →</span>
      </div>
      <div
        className="relative bg-surface"
        style={{ transform: `translateX(${gone === "done" ? "110%" : gone === "later" ? "-110%" : `${dx}px`})`, transition: start.current ? "none" : "transform 300ms cubic-bezier(.2,.8,.2,1)", touchAction: "pan-y" }}
        onPointerDown={(e) => { if (e.pointerType === "touch") start.current = { x: e.clientX, y: e.clientY, lock: "" }; }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const mx = e.clientX - s.x, my = e.clientY - s.y;
          if (!s.lock) s.lock = Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) ? "x" : Math.abs(my) > 8 ? "y" : "";
          if (s.lock === "x") setDx(Math.max(-140, Math.min(140, mx)));
        }}
        onPointerUp={() => { const d = dx; start.current = null; if (d > LIMIT) void act("done"); else if (d < -LIMIT) void act("later"); else setDx(0); }}
        onPointerCancel={() => { start.current = null; setDx(0); }}
      >
        {children}
      </div>
    </div>
  );
}
