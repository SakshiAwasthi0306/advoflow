import { describe, it, expect } from "vitest";
import type { Session, Workspace } from "@/lib/types";
import { emptyWorkspace, PermissionError, ValidationError } from "@/lib/services/workspace";
import { importCaseDiary } from "@/lib/services/diary-import";
import { createCase } from "@/lib/services/cases";
import { currentHearing } from "@/lib/services/orders";
import { addDays, todayIST } from "@/lib/util";

const S: Session = { userId: "u1", officeId: "office_a", role: "owner", name: "Test", mode: "demo" };
const today = todayIST();
const put = async (sha: string) => `office_a/${sha}.txt`;
const ws = (): Workspace => emptyWorkspace("office_a", "Test Office", []);

// Shaped exactly like what the Case Diary page's merge() wrote to localStorage["case-diary-v1"]. Fictional data.
function diaryExport() {
  return JSON.stringify({
    cases: {
      os4822025: {
        number: "O.S. 482/2025", title: "Ramesh v. Suresh", court: "Principal Civil Judge, Bengaluru", stage: "Written statement", nextDate: addDays(today, 9),
        hearings: [
          { orderDate: addDays(today, -20), nextDate: addDays(today, 5), stage: "Written statement", summary: "Defendant sought time to file WS.", adjourned: true, costs: null, changed: null, source: "Order 1 text (fictional)", verified: true },
          { orderDate: addDays(today, -2), nextDate: addDays(today, 9), stage: "Written statement", summary: "Re-listed; presiding officer on leave.", adjourned: true, costs: "Rs. 500", changed: { from: addDays(today, 5), to: addDays(today, 9) }, source: "Order 2 text (fictional)", verified: false },
        ],
        tasks: [
          { id: "t1", text: "Track filing of written statement", due: addDays(today, 9), priority: "high", done: false },
          { id: "t2", text: "Update client", due: null, priority: "normal", done: true },
        ],
        updates: [
          { en: "Old update", kn: "ಹಳೆಯ", date: addDays(today, -20) },
          { en: "Your case was adjourned. (diary message)", kn: "ನಿಮ್ಮ ಪ್ರಕರಣ ಮುಂದೂಡಲಾಗಿದೆ.", date: addDays(today, -2) },
        ],
      },
      unknowncase: {
        number: "Unknown case", title: "", court: "", stage: "", nextDate: null,
        hearings: [{ orderDate: null, nextDate: null, stage: "", summary: "Order recorded.", adjourned: false, costs: null, changed: null, source: "(image: photo.jpg) – original image not stored", verified: false }],
        tasks: [], updates: [],
      },
    },
    stats: { orders: 3 },
  });
}

describe("Case Diary import", () => {
  it("imports cases, order history, hearings, tasks and the diary's own client messages", async () => {
    const w = ws();
    const r = await importCaseDiary(w, S, diaryExport(), put);
    expect(r.cases.created).toBe(2);
    expect(r.orders.imported).toBe(3);
    expect(r.tasks.imported).toBe(2);
    expect(r.unverifiedHearings).toBe(1);

    const c = w.cases.find((x) => x.number === "O.S. 482/2025")!;
    expect(c.title).toBe("Ramesh v. Suresh");
    expect(c.stage).toBe("Written statement");
    expect(w.orders.filter((o) => o.caseId === c.id)).toHaveLength(2);
    expect(w.orders.every((o) => o.extractionSnapshot?.extractor === "case-diary-import")).toBe(true);

    // The diary's latest date was not verified there, so it is not confirmed here either; the earlier date is kept as history.
    const h = currentHearing(w, c.id)!;
    expect(h.date).toBe(addDays(today, 9));
    expect(h.status).toBe("awaiting_verification");
    expect(w.hearings.find((x) => x.caseId === c.id && x.date === addDays(today, 5))!.status).toBe("superseded");
    expect(w.dateChanges.some((d) => d.caseId === c.id && d.from === addDays(today, 5) && d.to === addDays(today, 9))).toBe(true);

    const done = w.tasks.find((t) => t.title === "Update client")!;
    expect(done.status).toBe("done");
    expect(w.tasks.find((t) => t.title === "Track filing of written statement")!.priority).toBe("high");

    const kn = w.clientUpdates.find((u) => u.caseId === c.id && u.lang === "kn" && u.text === "ನಿಮ್ಮ ಪ್ರಕರಣ ಮುಂದೂಡಲಾಗಿದೆ.");
    expect(kn?.status).toBe("draft");

    // The original order wording is stored as a reviewable document.
    const docs = w.documents.filter((d) => d.caseId === c.id);
    expect(docs.map((d) => d.textExtract)).toContain("Order 2 text (fictional)");
    expect(w.audit.some((a) => a.action === "diary.imported")).toBe(true);
  });

  it("is idempotent: importing the same diary twice adds nothing", async () => {
    const w = ws();
    await importCaseDiary(w, S, diaryExport(), put);
    const before = { cases: w.cases.length, orders: w.orders.length, tasks: w.tasks.length, hearings: w.hearings.length, docs: w.documents.length };
    const r = await importCaseDiary(w, S, diaryExport(), put);
    expect(r.orders.imported).toBe(0);
    expect(r.orders.skipped).toBe(3);
    expect(r.tasks.imported).toBe(0);
    expect({ cases: w.cases.length, orders: w.orders.length, tasks: w.tasks.length, hearings: w.hearings.length, docs: w.documents.length }).toEqual(before);
  });

  it("adds to an existing case written differently instead of duplicating it", async () => {
    const w = ws();
    const existing = createCase(w, S, { number: "OS 482 of 2025", petitioner: "Ramesh", respondent: "Suresh" });
    const r = await importCaseDiary(w, S, diaryExport(), put);
    expect(r.cases.matched).toBe(1);
    expect(w.cases.filter((c) => c.numberKey === existing.numberKey)).toHaveLength(1);
    expect(w.orders.filter((o) => o.caseId === existing.id)).toHaveLength(2);
  });

  it("rejects malformed data without changing anything", async () => {
    const w = ws();
    await expect(importCaseDiary(w, S, "not json", put)).rejects.toBeInstanceOf(ValidationError);
    await expect(importCaseDiary(w, S, JSON.stringify({ foo: 1 }), put)).rejects.toBeInstanceOf(ValidationError);
    expect(w.cases).toHaveLength(0);
    expect(w.audit).toHaveLength(0);
  });

  it("clerks and viewers cannot import", async () => {
    await expect(importCaseDiary(ws(), { ...S, role: "clerk" }, diaryExport(), put)).rejects.toBeInstanceOf(PermissionError);
    await expect(importCaseDiary(ws(), { ...S, role: "viewer" }, diaryExport(), put)).rejects.toBeInstanceOf(PermissionError);
  });
});
