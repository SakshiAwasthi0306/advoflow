import { createHash, randomUUID } from "node:crypto";

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
export const nowISO = () => new Date().toISOString();
export const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

export { todayIST, isValidISODate, parseIndianDate, daysBetween, addDays, formatDate } from "./dates";

/**
 * Normalise an Indian case number to TYPE|NUMBER|YEAR so that
 * "O.S.No.482 of 2025", "OS 482/2025" and "O.S. 482/2025" all compare equal.
 * Returns null when the type, number and year cannot all be identified.
 */
export function caseNumberKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/\bNO\b\.?/g, " ");
  const m = s.match(/([A-Z][A-Z.()\s]*?)\s*\.?\s*(\d+)\s*(?:\/|OF)\s*(\d{4})/);
  if (!m) return null;
  const type = m[1].replace(/[^A-Z]/g, "");
  if (!type) return null;
  return `${type}|${Number(m[2])}|${m[3]}`;
}

export function normaliseText(s: string): string {
  return s.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
}

export function csvCell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function slugKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
