import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, FlaskConical, PenLine, XCircle } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** The AdvoFlow mark: a seal with a quill stroke, drawn inline so it is crisp at any size and follows the theme. */
export function Seal({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="rgb(var(--c-navy-900))" />
      <circle cx="16" cy="16" r="12.2" fill="none" stroke="rgb(var(--c-paper))" strokeOpacity=".35" strokeWidth=".8" strokeDasharray="1.2 1.6" />
      <path d="M10.5 21.5 15.6 9.2c.2-.5.9-.5 1.1 0l5 12.3" fill="none" stroke="rgb(var(--c-paper))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6 17.2h6.9" stroke="rgb(var(--c-accent))" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="kicker mb-1.5">{eyebrow}</div>}
        <h1 className="display text-[28px] font-medium leading-tight sm:text-[32px]">{title}</h1>
        {subtitle && <div className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cx("card p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold tracking-[-0.005em]">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A section without a box: a small heading over a hairline. Use it where a card would only add noise. */
export function Section({ title, action, children, className, id }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-line pb-2">
        <h2 className="kicker !text-ink/70">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export type Tone = "danger" | "warn" | "ok" | "neutral" | "navy" | "demo" | "ai" | "accent";
const TONES: Record<Tone, string> = {
  danger: "bg-danger-soft text-danger border-danger-line",
  warn: "bg-warn-soft text-warn border-warn-line",
  ok: "bg-ok-soft text-ok border-ok-line",
  neutral: "bg-neutral-soft text-neutral border-neutral-line",
  navy: "bg-navy-50 text-navy-800 border-navy-100",
  demo: "bg-demo-soft text-demo border-demo-line",
  ai: "bg-ai-soft text-ai border-ai-line border-dashed",
  accent: "bg-accent-soft text-accent border-accent-line",
};
const ICONS: Record<Tone, typeof CheckCircle2> = { danger: XCircle, warn: AlertTriangle, ok: CheckCircle2, neutral: CircleDashed, navy: Clock, demo: FlaskConical, ai: PenLine, accent: AlertTriangle };

/** Status badge: colour + icon + words, so status is never conveyed by colour alone. */
export function Badge({ tone = "neutral", children, icon = true, title }: { tone?: Tone; children: ReactNode; icon?: boolean; title?: string }) {
  const I = ICONS[tone];
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-[3px] text-[11.5px] font-medium leading-none", TONES[tone])}>
      {icon && <I aria-hidden className="h-3 w-3" />}
      {children}
    </span>
  );
}

export function DemoBadge() {
  return <Badge tone="demo" title="Fictional demonstration data">Demo</Badge>;
}

/** Marks anything the AI proposed and nobody has confirmed yet. */
export function AIBadge({ children = "AI draft · not verified" }: { children?: ReactNode }) {
  return <span className="ai-chip" title="Suggested by AI from the document. Check it against the original before relying on it."><PenLine className="h-3 w-3" aria-hidden />{children}</span>;
}

const EMPTY_ART = (
  <svg viewBox="0 0 96 72" className="empty-art h-[72px] w-24" aria-hidden>
    <ellipse className="empty-shadow" cx="46" cy="66" rx="26" ry="3" fill="rgb(var(--c-line))" />
    <g className="empty-float">
      <rect x="22" y="14" width="44" height="40" rx="4" fill="rgb(var(--c-paper))" stroke="rgb(var(--c-line))" transform="rotate(-6 44 34)" />
      <rect x="26" y="10" width="44" height="42" rx="4" fill="rgb(var(--c-surface))" stroke="rgb(var(--c-neutral-line))" />
      <path className="empty-lines" d="M33 21h24M33 28h30M33 35h18" stroke="rgb(var(--c-navy-100))" strokeWidth="2.5" strokeLinecap="round" />
    </g>
    <g className="empty-gavel">
      <rect x="62" y="40" width="20" height="9" rx="2" fill="rgb(var(--c-accent))" transform="rotate(-35 72 44)" />
      <rect x="70" y="47" width="3.5" height="18" rx="1.5" fill="rgb(var(--c-navy-700))" transform="rotate(-35 72 56)" />
    </g>
    <circle className="empty-spark" cx="84" cy="22" r="2" fill="rgb(var(--c-accent))" />
    <circle className="empty-spark empty-spark-2" cx="16" cy="30" r="1.5" fill="rgb(var(--c-ai))" />
  </svg>
);

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[10px] border border-dashed border-line px-6 py-10 text-center">
      <div className="mb-3 text-muted">{icon ?? EMPTY_ART}</div>
      <div className="display text-lg font-medium">{title}</div>
      {body && <div className="mt-1 max-w-md text-sm text-muted">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: Tone }) {
  const inner = (
    <div className={cx("card h-full p-4 transition-colors", href && "hover:border-navy-700/40")}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx("display num mt-1 text-2xl font-medium", tone === "danger" && "text-danger", tone === "warn" && "text-warn")}>{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export function Notice({ tone = "warn", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const I = ICONS[tone];
  return (
    <div role="note" className={cx("flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm", TONES[tone])}>
      <I aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        <div className="text-ink/85">{children}</div>
      </div>
    </div>
  );
}

export function KeyVal({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 border-b border-line/60 py-2 text-sm last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="Sections" className="no-print -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cx(
            "relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
            t.key === active ? "text-accent after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full after:bg-gradient-to-r after:from-accent after:to-teal-500" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.count ? <span className="num ml-1.5 rounded bg-navy-50 px-1.5 py-px text-[11px] text-navy-800">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A diary-page date: weekday over a large day number over the month. Tone carries meaning (today, overdue). */
export function DateBlock({ date, tone = "neutral", size = "md" }: { date: string; tone?: "today" | "overdue" | "neutral" | "muted"; size?: "md" | "lg" }) {
  const [y, m, d] = date.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const tones = {
    today: "border-transparent bg-gradient-to-b from-accent to-navy-800 text-white shadow-glow",
    overdue: "border-danger-line bg-danger-soft text-danger",
    neutral: "border-line bg-surface text-ink",
    muted: "border-line bg-paper text-muted",
  };
  return (
    <div className={cx("flex shrink-0 flex-col items-center justify-center rounded-lg border text-center leading-none", tones[tone], size === "lg" ? "h-[76px] w-[68px]" : "h-[58px] w-[52px]")} aria-hidden>
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">{wd}</span>
      <span className={cx("display num font-medium", size === "lg" ? "mt-1 text-[30px]" : "mt-0.5 text-[22px]")}>{d}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] opacity-80">{MONTHS[m - 1]}</span>
    </div>
  );
}
