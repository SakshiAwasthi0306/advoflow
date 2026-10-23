// Adding a hearing by hand (dashboard and case page "Add hearing").
import { describe, it, expect } from "vitest";
import { addHearing, currentHearing } from "@/lib/services/orders";
import { emptyWorkspace, NotFoundError, PermissionError, ValidationError } from "@/lib/services/workspace";
import type { Session, Workspace } from "@/lib/types";

const owner: Session = { userId: "u1", officeId: "office_a", role: "owner", name: "Adv", mode: "password" };
const clerk: Session = { ...owner, userId: "u2", role: "clerk" };
const now = new Date().toISOString();
const TODAY = "2026-10-23";

function ws(): Workspace {
  const w = emptyWorkspace("office_a", "Chambers", []);
  w.cases.push({ id: "c1", number: "O.S. 1/2026", numberKey: "OS|1|2026", cnr: null, title: "A v. B", parties: { petitioner: "A", respondent: "B" }, court: "Court", caseType: "OS", stage: "", clientId: null, status: "active", isDemo: false, createdAt: now, updatedAt: now });
  return w;
}

describe("adding a hearing", () => {
  it("an advocate can add a confirmed date; a clerk's date waits for verification", () => {
    const w = ws();
    expect(addHearing(w, owner, "c1", { date: "2026-11-02", purpose: "Arguments", confirmed: true }, TODAY)).toMatchObject({ status: "confirmed", confirmedBy: "u1", purpose: "Arguments" });
    const w2 = ws();
    expect(() => addHearing(w2, clerk, "c1", { date: "2026-11-02", purpose: "", confirmed: true }, TODAY)).toThrow(PermissionError);
    expect(addHearing(w2, clerk, "c1", { date: "2026-11-02", purpose: "", confirmed: false }, TODAY).status).toBe("awaiting_verification");
  });

  it("moving an upcoming hearing keeps the old date as history and flags tasks due on it", () => {
    const w = ws();
    const first = addHearing(w, owner, "c1", { date: "2026-11-02", purpose: "", confirmed: true }, TODAY);
    w.tasks.push({ id: "t1", caseId: "c1", title: "File list", description: "", dueDate: "2026-11-02", priority: "normal", status: "open", source: "manual", sourceOrderId: null, sourceReportId: null, dedupeKey: null, assigneeId: null, needsReschedule: null, createdBy: "u1", createdAt: now, completedAt: null } as never);
    const second = addHearing(w, owner, "c1", { date: "2026-11-09", purpose: "", confirmed: true }, TODAY);
    expect(first).toMatchObject({ status: "superseded", supersededById: second.id });
    expect(currentHearing(w, "c1")?.id).toBe(second.id);
    expect(w.dateChanges[0]).toMatchObject({ from: "2026-11-02", to: "2026-11-09", orderId: null, affectedTaskIds: ["t1"] });
    expect(w.tasks[0].needsReschedule).toEqual({ from: "2026-11-02", to: "2026-11-09" });
  });

  it("the same date twice changes nothing; past dates and other offices' cases are refused", () => {
    const w = ws();
    const a = addHearing(w, owner, "c1", { date: "2026-11-02", purpose: "", confirmed: false }, TODAY);
    const b = addHearing(w, owner, "c1", { date: "2026-11-02", purpose: "", confirmed: true }, TODAY);
    expect(b.id).toBe(a.id);
    expect(w.hearings).toHaveLength(1);
    expect(b.status).toBe("confirmed");
    expect(() => addHearing(w, owner, "c1", { date: "2026-10-01", purpose: "", confirmed: false }, TODAY)).toThrow(ValidationError);
    expect(() => addHearing(w, owner, "case_of_another_office", { date: "2026-11-02", purpose: "", confirmed: false }, TODAY)).toThrow(NotFoundError);
  });
});
