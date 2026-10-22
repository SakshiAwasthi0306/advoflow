import { z } from "zod";
import type { ApproveInput } from "../schemas";
import type { CaseRecord, DocumentRecord, Extraction, ExtractedField, Session, Task, Workspace } from "../types";
import { caseNumberKey, isValidISODate, newId, nowISO, sha256, todayIST } from "../util";
import { approveJob, createJob } from "./orders";
import { audit, requireRole, ValidationError } from "./workspace";

/**
 * Import from the original single-page "Case Diary" prototype.
 * That page kept everything in the browser's localStorage under the key "case-diary-v1":
 *   { cases: { [normalisedNumber]: { number, title, court, stage, nextDate, hearings[], tasks[], updates[] } }, stats? }
 * Each diary hearing becomes a document + an approved order through the normal approval path, so hearing
 * history, date changes and client drafts behave exactly as for uploaded orders. Re-importing is a no-op.
 */

const date = z.string().nullish().transform((d) => (d && isValidISODate(d) ? d : null));
const text = (max: number) => z.string().nullish().transform((s) => (s ?? "").trim().slice(0, max));

const diaryHearing = z.object({
  orderDate: date,
  nextDate: date,
  stage: text(120),
  summary: text(2000),
  adjourned: z.boolean().nullish().transform((b) => !!b),
  costs: z.string().nullish().transform((s) => (s ? s.trim().slice(0, 200) : null)),
  source: text(20000),
  verified: z.boolean().nullish().transform((b) => !!b),
});

const diaryTask = z.object({
  id: z.string().nullish(),
  text: text(300),
  due: date,
  priority: z.string().nullish().transform((p) => (p === "high" ? "high" : "normal") as "high" | "normal"),
  done: z.boolean().nullish().transform((b) => !!b),
});

const diaryCase = z.object({
  number: text(80),
  title: text(300),
  court: text(200),
  stage: text(120),
  hearings: z.array(diaryHearing).max(500).default([]),
  tasks: z.array(diaryTask).max(1000).default([]),
  updates: z.array(z.object({ en: text(4000), kn: text(4000) })).max(500).default([]),
});

export const diaryExportSchema = z.object({
  cases: z.record(diaryCase).refine((c) => Object.keys(c).length <= 2000, "Too many cases in one import (max 2000)"),
});

export type DiaryImportResult = {
  cases: { created: number; matched: number };
  orders: { imported: number; skipped: number };
  tasks: { imported: number; skipped: number };
  clientUpdates: number;
  unverifiedHearings: number;
  warnings: string[];
};

/** Accepts the raw localStorage value (a JSON string) or an already-parsed object. */
export function parseDiaryExport(raw: unknown) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ValidationError("That is not valid JSON. Copy the whole value of the \"case-diary-v1\" key.");
    }
  }
  const r = diaryExportSchema.safeParse(data);
  if (!r.success) throw new ValidationError(`This does not look like a Case Diary export: ${r.error.issues[0]?.path.join(".") || "input"} ${r.error.issues[0]?.message ?? ""}`.trim());
  return r.data;
}

const field = <T,>(value: T | null): ExtractedField<T> => ({ value, status: value === null ? "missing" : "inferred", source: null });

export async function importCaseDiary(
  ws: Workspace,
  session: Session,
  raw: unknown,
  put: (sha: string, bytes: Uint8Array) => Promise<string>,
): Promise<DiaryImportResult> {
  requireRole(session, "advocate");
  const data = parseDiaryExport(raw);
  const out: DiaryImportResult = { cases: { created: 0, matched: 0 }, orders: { imported: 0, skipped: 0 }, tasks: { imported: 0, skipped: 0 }, clientUpdates: 0, unverifiedHearings: 0, warnings: [] };

  for (const dc of Object.values(data.cases)) {
    const number = dc.number || "Unknown case";
    const key = caseNumberKey(number);
    const findCase = (): CaseRecord | undefined =>
      ws.cases.find((c) => c.status !== "archived" && (key ? c.numberKey === key : c.number.toLowerCase() === number.toLowerCase()));
    const existed = !!findCase();
    if (!key) out.warnings.push(`"${number}": case number not recognised; matched by exact text instead.`);

    // Oldest order first, so hearings supersede each other in the order the diary recorded them.
    const hearings = dc.hearings.map((h, i) => ({ h, i })).sort((a, b) => (a.h.orderDate ?? "").localeCompare(b.h.orderDate ?? "") || a.i - b.i);
    let lastOrderId: string | null = null;
    for (const { h, i } of hearings) {
      const body = h.source || `(No order text was kept in the Case Diary for this entry.)\n${h.summary}`;
      const fileText = `Imported from Case Diary\nCase: ${number}\nOrder date: ${h.orderDate ?? "not recorded"}\n\n${body}`;
      const bytes = new TextEncoder().encode(fileText);
      const sha = sha256(bytes);
      if (ws.documents.some((d) => d.sha256 === sha)) {
        out.orders.skipped++;
        continue;
      }
      const doc: DocumentRecord = {
        id: newId("doc"), caseId: null, filename: `Case Diary ${number.replace(/[^\w.-]+/g, "-")} entry ${i + 1}.txt`, mime: "text/plain",
        size: bytes.length, sha256: sha, storageKey: await put(sha, bytes), kind: "order", textExtract: body, textSource: "pasted",
        isDemo: false, uploadedBy: session.userId, createdAt: nowISO(),
      };
      const ex: Extraction = {
        caseNumber: field(number), cnr: field<string>(null), title: field(dc.title || null), court: field(dc.court || null),
        orderDate: field(h.orderDate), nextHearingDate: field(h.nextDate), stage: field(h.stage || null), summary: field(h.summary || null),
        adjourned: field(h.adjourned), costs: field(h.costs), directions: [], tasks: [], clientUpdateEn: "", clientUpdateKn: "",
        confidence: "medium", warnings: ["Imported from the Case Diary prototype; fields were read by that page's AI and not re-checked."],
        extractor: "case-diary-import", model: null,
      };
      const { job } = createJob(ws, session, { doc, idempotencyKey: sha, hint: { caseNumber: number, court: dc.court, context: "Case Diary import" }, extraction: ex, error: null });
      const target = findCase();
      const yes = <T,>(value: T | null) => ({ approved: value !== null, value });
      const input: ApproveInput = {
        caseDecision: target ? { mode: "existing", caseId: target.id } : { mode: "new", number, title: dc.title, court: dc.court, caseType: "" },
        fields: { orderDate: yes(h.orderDate), nextHearingDate: yes(h.nextDate), stage: yes(h.stage || null), summary: yes(h.summary || null), adjourned: yes(h.adjourned), costs: yes(h.costs), court: yes(dc.court || null), title: yes(dc.title || null) },
        // The diary's own "verified" flag decides whether the next date counts as confirmed.
        confirmHearing: h.verified,
        directions: [],
        tasks: [],
      };
      const r = approveJob(ws, session, job.id, input);
      lastOrderId = r.orderId;
      out.orders.imported++;
      if (h.nextDate && !h.verified) out.unverifiedHearings++;
    }

    const c = findCase();
    if (!c) {
      if (dc.hearings.length || dc.tasks.length) out.warnings.push(`"${number}": no case could be created, so its tasks were skipped.`);
      continue;
    }
    if (existed) out.cases.matched++;
    else out.cases.created++;
    if (!c.title && dc.title) c.title = dc.title;
    if (!c.court && dc.court) c.court = dc.court;
    if (!c.stage && dc.stage) c.stage = dc.stage;

    for (const t of dc.tasks) {
      if (!t.text) continue;
      const dedupeKey = `diary:${sha256(`${t.id ?? ""}|${t.text}|${t.due ?? ""}`).slice(0, 20)}`;
      if (ws.tasks.some((x) => x.caseId === c.id && x.dedupeKey === dedupeKey)) {
        out.tasks.skipped++;
        continue;
      }
      const task: Task = {
        id: newId("task"), caseId: c.id, title: t.text, description: "Imported from Case Diary.", dueDate: t.due, priority: t.priority,
        status: t.done ? "done" : "open", source: "manual", sourceOrderId: null, sourceReportId: null, dedupeKey, assigneeId: null,
        needsReschedule: null, createdBy: session.userId, createdAt: nowISO(), completedAt: t.done ? nowISO() : null,
      };
      ws.tasks.push(task);
      out.tasks.imported++;
    }

    // Keep the diary's own (AI-written) client messages for the latest order in place of the template drafts.
    const last = dc.updates.at(-1);
    if (last && lastOrderId) {
      for (const lang of ["en", "kn"] as const) {
        const msg = lang === "en" ? last.en : last.kn;
        const draft = ws.clientUpdates.find((u) => u.sourceOrderId === lastOrderId && u.lang === lang);
        if (msg && draft && draft.status === "draft") {
          draft.text = msg;
          draft.updatedAt = nowISO();
          out.clientUpdates++;
        }
      }
    }
  }

  audit(ws, session, "diary.imported", "office", ws.office.id, null,
    `Case Diary import: ${out.cases.created} new case(s), ${out.orders.imported} order(s), ${out.tasks.imported} task(s); ${out.orders.skipped + out.tasks.skipped} already imported (${todayIST()})`);
  return out;
}
