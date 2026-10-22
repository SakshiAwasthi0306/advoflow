// Pure date helpers, safe to use in browser components.
import type { ISODate } from "./types";

/** Today's date in India (IST), as YYYY-MM-DD. Courts and deadlines run on IST. */
export function todayIST(now: Date = new Date()): ISODate {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function isValidISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Parse Indian-style dates: 05-11-2026, 5/11/2026, 05.11.2026, 2026-11-05, "5th November 2026". Day first. */
export function parseIndianDate(raw: string): ISODate | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return mk(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS.findIndex((x) => m![2].toLowerCase().startsWith(x));
    if (mon >= 0) return mk(+m[3], mon + 1, +m[1]);
  }
  return null;
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function mk(y: number, mo: number, d: number): ISODate | null {
  const v = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidISODate(v) ? v : null;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5);
}
export function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(Date.parse(d + "T00:00:00Z") + n * 864e5);
  return t.toISOString().slice(0, 10);
}

export function formatDate(d: ISODate | null | undefined): string {
  if (!d || !isValidISODate(d)) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}

