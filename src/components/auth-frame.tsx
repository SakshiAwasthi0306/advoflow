import type { ReactNode } from "react";
import { CalendarCheck2, Languages, PenLine } from "lucide-react";
import { Seal } from "./ui";

// The frame for sign-in, registration and password pages, so they feel like the same product.
const PROMISES = [
  { icon: CalendarCheck2, text: "Hearing dates come from your orders, never guessed." },
  { icon: PenLine, text: "AI drafts stay in pencil until you confirm them." },
  { icon: Languages, text: "Client updates in the language your client reads." },
];

export function AuthFrame({ title, subtitle, children, footer, wide }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden bg-[rgb(10_37_64)] px-12 py-12 text-[rgb(248_245_238)] lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <Seal className="h-9 w-9 [&_circle:first-child]:fill-[rgb(248_245_238/0.12)]" />
          <span className="display text-[22px] font-medium tracking-tight">AdvoFlow</span>
        </div>
        <div className="mt-auto max-w-sm">
          <p className="display text-[34px] font-normal leading-[1.15]">Your court diary,<br />kept in order.</p>
          <ul className="mt-8 space-y-4 text-[15px] text-[rgb(248_245_238/0.82)]">
            {PROMISES.map((p) => (
              <li key={p.text} className="flex gap-3"><p.icon className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(120_178_245)]" aria-hidden />{p.text}</li>
            ))}
          </ul>
        </div>
        <p className="mt-12 text-xs text-[rgb(248_245_238/0.5)]">For advocates and chambers in India.</p>
        {/* A quiet docket-line texture */}
        <svg aria-hidden className="pointer-events-none absolute -right-32 top-16 h-[460px] w-[460px] opacity-[0.035]" viewBox="0 0 200 200">
          {Array.from({ length: 14 }, (_, i) => <line key={i} x1="10" x2="190" y1={14 + i * 13} y2={14 + i * 13} stroke="currentColor" strokeWidth="1.2" />)}
          <circle cx="100" cy="100" r="86" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </aside>
      <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-10 sm:px-8">
        <div className={`w-full animate-rise ${wide ? "max-w-md" : "max-w-sm"}`}>
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><Seal className="h-8 w-8" /><span className="display text-[20px] font-medium text-navy-900">AdvoFlow</span></div>
          <h1 className="display text-[30px] font-medium leading-tight">{title}</h1>
          {subtitle && <div className="mb-6 mt-2 text-sm text-muted">{subtitle}</div>}
          {!subtitle && <div className="mb-6" />}
          {children}
          {footer && <div className="mt-8 border-t border-line pt-5 text-center text-sm">{footer}</div>}
        </div>
      </div>
    </main>
  );
}
