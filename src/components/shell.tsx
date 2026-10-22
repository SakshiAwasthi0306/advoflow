"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, Bell, BookOpen, Briefcase, CalendarDays, CheckSquare, CircleUserRound, LayoutDashboard, Menu, Scale, Search, Settings, Upload, Users, X } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cases", label: "My Cases", icon: Briefcase },
  { href: "/upload", label: "Upload Orders", icon: Upload },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/research", label: "Legal Research", icon: BookOpen },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export interface Alert { text: string; href: string; tone: "danger" | "warn" }

function NavLinks({ onNavigate, reviewCount }: { onNavigate?: () => void; reviewCount: number }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.map(({ href, label, icon: I }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? "bg-white/10 font-semibold text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
            >
              <I className="h-4 w-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {href === "/upload" && reviewCount > 0 && <span className="rounded-full bg-warn-soft px-1.5 text-xs font-semibold text-warn">{reviewCount}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-3 py-1 text-white">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><Scale className="h-4 w-4" aria-hidden /></span>
      <span className="font-serif text-lg font-semibold tracking-tight">AdvoFlow</span>
    </Link>
  );
}

export function Shell({ children, office, user, role, alerts, reviewCount, modeNote }: { children: ReactNode; office: string; user: string; role: string; alerts: Alert[]; reviewCount: number; modeNote: string | null }) {
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const router = useRouter();
  const bellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBell(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  return (
    <div className="min-h-screen lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 flex-col bg-sidebar px-3 py-4 lg:flex">
        <Brand />
        <nav aria-label="Main" className="mt-6 flex-1"><NavLinks reviewCount={reviewCount} /></nav>
        <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70">
          <div className="font-medium text-white">{office}</div>
          <div>{user} · {role}</div>
        </div>
      </aside>
      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-sidebar px-3 py-4">
            <div className="flex items-center justify-between"><Brand /><button aria-label="Close menu" className="p-2 text-white" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
            <nav aria-label="Main" className="mt-6"><NavLinks onNavigate={() => setOpen(false)} reviewCount={reviewCount} /></nav>
          </div>
        </div>
      )}
      <header className="no-print sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6">
          <button className="btn-ghost btn-sm lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <form
            role="search"
            className="relative flex-1 max-w-md"
            onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); router.push(`/cases?q=${encodeURIComponent(String(q ?? ""))}`); }}
          >
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden />
            <label htmlFor="global-search" className="sr-only">Search cases, parties, CNR or clients</label>
            <input id="global-search" name="q" className="input pl-9" placeholder="Search cases, parties, CNR, clients" />
          </form>
          <div className="relative" ref={bellRef}>
            <button className="btn-ghost btn-sm relative" aria-label={`Notifications (${alerts.length})`} aria-expanded={bell} onClick={(e) => { e.stopPropagation(); setBell(!bell); }}>
              <Bell className="h-5 w-5" />
              {alerts.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-surface">{alerts.length}</span>}
            </button>
            {bell && (
              <div className="absolute right-0 mt-2 w-[min(92vw,360px)] rounded-xl border border-line bg-surface p-2 shadow-xl">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted">Needs attention</div>
                {alerts.length === 0 ? <div className="px-2 py-3 text-sm text-muted">Nothing needs attention right now.</div> : (
                  <ul>{alerts.slice(0, 12).map((a, i) => (
                    <li key={i}><Link href={a.href} onClick={() => setBell(false)} className="flex gap-2 rounded-lg px-2 py-2 text-sm hover:bg-navy-50">
                      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.tone === "danger" ? "bg-danger" : "bg-warn"}`} />
                      <span><span className="sr-only">{a.tone === "danger" ? "Urgent: " : "Attention: "}</span>{a.text}</span>
                    </Link></li>
                  ))}</ul>
                )}
              </div>
            )}
          </div>
          <span className="hidden text-right text-xs leading-tight text-muted md:block"><span className="block font-medium text-ink">{user}</span>{office}</span>
          <Link href="/upload" className="btn-primary"><Upload className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Upload Court Order</span><span className="sm:hidden">Upload</span></Link>
        </div>
        {modeNote && <div className="border-t border-demo-line bg-demo-soft px-4 py-1.5 text-center text-xs text-demo sm:px-6">{modeNote}</div>}
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
