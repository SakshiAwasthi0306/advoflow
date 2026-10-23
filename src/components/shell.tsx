"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Bell, BookOpen, CalendarDays, ChevronRight, FileText, LayoutDashboard, ListChecks, Menu, NotebookTabs, Search, Settings, Upload, Users, X } from "lucide-react";
import { Seal } from "./ui";

// Navigation grouped the way an advocate's day is: today, the practice, documents and research, and the office.
const GROUPS: { label: string | null; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  { label: null, items: [{ href: "/", label: "Today", icon: LayoutDashboard }] },
  { label: "Practice", items: [
    { href: "/cases", label: "Case diary", icon: NotebookTabs },
    { href: "/calendar", label: "Hearings", icon: CalendarDays },
    { href: "/tasks", label: "Tasks", icon: ListChecks },
    { href: "/clients", label: "Clients", icon: Users },
  ] },
  { label: "Orders & research", items: [
    { href: "/upload", label: "Court orders", icon: FileText },
    { href: "/research", label: "Legal research", icon: BookOpen },
  ] },
  { label: "Office", items: [
    { href: "/reports", label: "Reports", icon: BarChart3 },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

export interface Alert { text: string; href: string; tone: "danger" | "warn" }

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "A";

function NavLinks({ onNavigate, reviewCount }: { onNavigate?: () => void; reviewCount: number }) {
  const path = usePathname();
  return (
    <div className="space-y-5">
      {GROUPS.map((g, gi) => (
        <div key={gi}>
          {g.label && <div className="kicker mb-1.5 px-3 !text-[10px]">{g.label}</div>}
          <ul className="space-y-px">
            {g.items.map(({ href, label, icon: I }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href) || (href === "/upload" && path.startsWith("/review"));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-2.5 rounded-md px-3 py-[7px] text-[14px] transition-colors ${active ? "bg-surface font-medium text-navy-900 shadow-card" : "text-ink/70 hover:bg-surface/60 hover:text-ink"}`}
                  >
                    {active && <span aria-hidden className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-accent" />}
                    <I className={`h-[17px] w-[17px] ${active ? "text-navy-800" : "text-muted group-hover:text-ink"}`} aria-hidden />
                    <span className="flex-1">{label}</span>
                    {href === "/upload" && reviewCount > 0 && <span className="num rounded bg-accent px-1.5 text-[11px] font-semibold leading-5 text-surface" title={`${reviewCount} to review`}>{reviewCount}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-3 py-1">
      <Seal className="h-7 w-7" />
      <span className="display text-[19px] font-medium tracking-tight text-navy-900">AdvoFlow</span>
    </Link>
  );
}

/** Profile comes first: who is signed in, and in which office. */
function ProfileCard({ user, office, role, onNavigate }: { user: string; office: string; role: string; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <Link href="/profile" onClick={onNavigate} aria-current={path.startsWith("/profile") ? "page" : undefined} className={`group flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${path.startsWith("/profile") ? "border-navy-700/30 bg-surface" : "border-transparent hover:border-line hover:bg-surface/70"}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-900 text-[12px] font-semibold text-surface">{initials(user)}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13.5px] font-medium">{user}</span>
        <span className="block truncate text-[12px] text-muted">{office} · {role}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export function Shell({ children, office, user, role, alerts, reviewCount, modeNote }: { children: ReactNode; office: string; user: string; role: string; alerts: Alert[]; reviewCount: number; modeNote: string | null }) {
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const router = useRouter();
  const bellRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBell(false); };
    // "/" jumps to search, like most tools people already know; never while typing in a field.
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") { setBell(false); setOpen(false); }
    };
    document.addEventListener("click", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("click", h); document.removeEventListener("keydown", k); };
  }, []);
  const urgent = alerts.filter((a) => a.tone === "danger").length;

  return (
    <div className="min-h-screen lg:pl-[248px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r border-line bg-sidebar px-3 py-4 lg:flex">
        <Brand />
        <div className="mt-5"><ProfileCard user={user} office={office} role={role} /></div>
        <nav aria-label="Main" className="mt-6 flex-1 overflow-y-auto"><NavLinks reviewCount={reviewCount} /></nav>
        <p className="px-3 text-[11px] leading-snug text-muted">Press <kbd className="rounded border border-line bg-surface px-1 font-mono text-[10px]">/</kbd> to search</p>
      </aside>
      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="animate-fade absolute inset-0 bg-navy-950/40" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 w-[284px] overflow-y-auto border-r border-line bg-sidebar px-3 py-4">
            <div className="flex items-center justify-between"><Brand /><button aria-label="Close menu" className="btn-ghost btn-sm" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
            <div className="mt-5"><ProfileCard user={user} office={office} role={role} onNavigate={() => setOpen(false)} /></div>
            <nav aria-label="Main" className="mt-6"><NavLinks onNavigate={() => setOpen(false)} reviewCount={reviewCount} /></nav>
          </div>
        </div>
      )}
      <header className="no-print sticky top-0 z-30 border-b border-line/80 bg-paper/90 backdrop-blur-md">
        <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <button className="btn-ghost btn-sm lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <Link href="/" className="mr-1 lg:hidden" aria-label="AdvoFlow home"><Seal className="h-7 w-7" /></Link>
          <form
            role="search"
            className="relative max-w-md flex-1"
            onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); router.push(`/cases?q=${encodeURIComponent(String(q ?? ""))}`); }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <label htmlFor="global-search" className="sr-only">Search cases, parties, CNR or clients</label>
            <input ref={searchRef} id="global-search" name="q" className="input !bg-surface/80 pl-9" placeholder="Search cases, parties, CNR, clients" />
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative" ref={bellRef}>
              <button className="btn-ghost btn-sm relative !px-2" aria-label={`Needs attention (${alerts.length})`} aria-expanded={bell} onClick={(e) => { e.stopPropagation(); setBell(!bell); }}>
                <Bell className="h-5 w-5" />
                {alerts.length > 0 && <span className={`num absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-surface ring-2 ring-paper ${urgent ? "bg-danger" : "bg-accent"}`}>{alerts.length}</span>}
              </button>
              {bell && (
                <div className="card-raised animate-rise absolute right-0 mt-2 w-[min(92vw,380px)] p-1.5">
                  <div className="kicker px-2.5 pb-1 pt-1.5">Needs attention</div>
                  {alerts.length === 0 ? <div className="px-2.5 py-4 text-sm text-muted">All clear. Nothing is waiting on you right now.</div> : (
                    <ul>{alerts.slice(0, 12).map((a, i) => (
                      <li key={i}><Link href={a.href} onClick={() => setBell(false)} className="flex gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-navy-50">
                        <span aria-hidden className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${a.tone === "danger" ? "bg-danger" : "bg-accent"}`} />
                        <span><span className="sr-only">{a.tone === "danger" ? "Urgent: " : "Attention: "}</span>{a.text}</span>
                      </Link></li>
                    ))}</ul>
                  )}
                </div>
              )}
            </div>
            <Link href="/upload" className="btn-primary"><Upload className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Record court order</span><span className="sm:hidden">Order</span></Link>
          </div>
        </div>
        {modeNote && <div className="border-t border-line/80 bg-demo-soft/60 px-4 py-1 text-center text-[11.5px] text-demo sm:px-6">{modeNote}</div>}
      </header>
      <main id="main" className="mx-auto max-w-[1180px] px-4 py-7 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
