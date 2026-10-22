import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, FlaskConical, HelpCircle, XCircle } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{eyebrow}</div>}
        <h1 className="font-serif text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("card p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = "danger" | "warn" | "ok" | "neutral" | "navy" | "demo";
const TONES: Record<Tone, string> = {
  danger: "bg-danger-soft text-danger border-danger-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  ok: "bg-ok-soft text-ok border-ok-line",
  neutral: "bg-neutral-soft text-neutral border-neutral-line",
  navy: "bg-navy-50 text-navy-800 border-navy-100",
  demo: "bg-demo-soft text-demo border-demo-line",
};
const ICONS: Record<Tone, typeof CheckCircle2> = { danger: XCircle, warn: AlertTriangle, ok: CheckCircle2, neutral: CircleDashed, navy: Clock, demo: FlaskConical };

/** Status badge: colour + icon + words, so status is never conveyed by colour alone. */
export function Badge({ tone = "neutral", children, icon = true, title }: { tone?: Tone; children: ReactNode; icon?: boolean; title?: string }) {
  const I = ICONS[tone];
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", TONES[tone])}>
      {icon && <I aria-hidden className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

export function DemoBadge() {
  return <Badge tone="demo" title="Fictional demonstration data">Demo</Badge>;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <div className="mb-2 text-muted">{icon ?? <HelpCircle className="h-6 w-6" aria-hidden />}</div>
      <div className="font-medium">{title}</div>
      {body && <div className="mt-1 max-w-md text-sm text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: Tone }) {
  const inner = (
    <div className={cx("card h-full p-4 transition-colors", href && "hover:border-navy-700/40")}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx("mt-1 font-serif text-2xl font-semibold", tone === "danger" && "text-danger", tone === "warn" && "text-warn")}>{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export function Notice({ tone = "warn", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const I = ICONS[tone];
  return (
    <div role="note" className={cx("flex gap-2 rounded-lg border px-3 py-2.5 text-sm", TONES[tone])}>
      <I aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <div className="font-semibold">{title}</div>}
        <div className="text-ink/90">{children}</div>
      </div>
    </div>
  );
}

export function KeyVal({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="Sections" className="no-print -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cx(
            "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-navy-900 text-navy-900" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.count ? <span className="ml-1.5 rounded-full bg-navy-50 px-1.5 text-xs text-navy-800">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
