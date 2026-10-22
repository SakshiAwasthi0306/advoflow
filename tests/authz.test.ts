import { describe, it, expect } from "vitest";
import type { Session, Workspace } from "@/lib/types";
import { emptyWorkspace, NotFoundError, PermissionError } from "@/lib/services/workspace";
import { authorize, can, owned } from "@/lib/authz";
import { isCrossSiteWrite } from "@/lib/csrf";
import { parseEnv } from "@/lib/env";
import { hitLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/http";
import { seedDemo } from "@/lib/demo/seed";

const S = (role: Session["role"], officeId = "office_a"): Session => ({ userId: "u1", officeId, role, name: "T", mode: "password" });

async function office(id: string): Promise<Workspace> {
  const w = emptyWorkspace(id, id, []);
  await seedDemo(w, S("owner", id), async (sha) => `${id}/${sha}.txt`);
  return w;
}

describe("authorization helper", () => {
  it("finds records only inside the session's office and answers the same 404 for 'missing' and 'another office'", async () => {
    const a = await office("office_a");
    const b = await office("office_b");
    const caseB = b.cases[0];
    expect(owned.case(a, a.cases[0].id).id).toBe(a.cases[0].id);
    const otherOffice = () => owned.case(a, caseB.id);
    const missing = () => owned.case(a, "case_does_not_exist");
    expect(otherOffice).toThrow(NotFoundError);
    expect(missing).toThrow(NotFoundError);
    let m1 = "", m2 = "";
    try { otherOffice(); } catch (e) { m1 = (e as Error).message; }
    try { missing(); } catch (e) { m2 = (e as Error).message; }
    expect(m1).toBe(m2);
    for (const [kind, rec] of [["hearing", b.hearings[0]], ["order", b.orders[0]], ["task", b.tasks[0]], ["document", b.documents[0]], ["clientUpdate", b.clientUpdates[0]], ["report", b.research[0]], ["job", b.jobs[0]]] as const) {
      expect(() => (owned[kind] as (w: Workspace, id: unknown) => unknown)(a, rec.id)).toThrow(NotFoundError);
    }
    expect(() => owned.case(a, { id: a.cases[0].id })).toThrow(NotFoundError); // non-string ids never match
  });

  it("requires the parent case of hearings, orders, tasks and documents to be in the same office", async () => {
    const a = await office("office_a");
    const t = a.tasks[0];
    a.tasks.push({ ...t, id: "task_orphan", caseId: "case_from_elsewhere" }); // e.g. a corrupted or injected row
    expect(() => owned.task(a, "task_orphan")).toThrow(NotFoundError);
    a.documents.push({ ...a.documents[0], id: "doc_unattached", caseId: null });
    expect(owned.document(a, "doc_unattached").id).toBe("doc_unattached"); // unattached uploads still belong to the office
  });

  it("maps roles to actions", () => {
    expect(can(S("viewer"), "read")).toBe(true);
    expect(can(S("viewer"), "edit")).toBe(false);
    expect(can(S("clerk"), "edit")).toBe(true);
    expect(can(S("clerk"), "approve")).toBe(false);
    expect(can(S("advocate"), "approve")).toBe(true);
    expect(can(S("advocate"), "manage_office")).toBe(false);
    expect(() => authorize(S("owner"), "manage_office")).not.toThrow();
    expect(() => authorize(S("clerk"), "approve")).toThrow(PermissionError);
  });
});

describe("CSRF check", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("blocks cross-site writes and allows same-site ones and reads", () => {
    expect(isCrossSiteWrite("POST", h({ "sec-fetch-site": "cross-site" }), "app.example")).toBe(true);
    expect(isCrossSiteWrite("POST", h({ "sec-fetch-site": "same-site" }), "app.example")).toBe(true); // a sibling subdomain is not us
    expect(isCrossSiteWrite("PATCH", h({ "sec-fetch-site": "same-origin" }), "app.example")).toBe(false);
    expect(isCrossSiteWrite("POST", h({ origin: "https://evil.example" }), "app.example")).toBe(true);
    expect(isCrossSiteWrite("POST", h({ origin: "https://app.example" }), "app.example")).toBe(false);
    expect(isCrossSiteWrite("POST", h({ origin: "null" }), "app.example")).toBe(true); // sandboxed iframes, file://
    expect(isCrossSiteWrite("POST", h({ origin: "https://advoflow.example" }), "internal:3000", "https://advoflow.example")).toBe(false);
    expect(isCrossSiteWrite("GET", h({ "sec-fetch-site": "cross-site" }), "app.example")).toBe(false);
    expect(isCrossSiteWrite("POST", h({}), "app.example")).toBe(false); // non-browser client: no ambient cookies
  });
});

describe("auth configuration", () => {
  it("password mode needs a 32+ character secret and PostgreSQL; registration is off unless enabled", () => {
    const e = parseEnv({ AUTH_MODE: "password" });
    expect(e.issues.map((i) => i.variable).sort()).toEqual(["AUTH_SECRET", "DATABASE_URL"]);
    expect(e.allowRegistration).toBe(false);
    expect(parseEnv({ AUTH_MODE: "password", AUTH_SECRET: "s".repeat(32), DATABASE_URL: "postgresql://h/db", ALLOW_REGISTRATION: "true" })).toMatchObject({ issues: [], allowRegistration: true });
    expect(parseEnv({ ALLOW_REGISTRATION: "true" }).issues.map((i) => i.variable)).toEqual(["ALLOW_REGISTRATION"]);
    expect(parseEnv({ ALLOW_REGISTRATION: "yes" }).allowRegistration).toBe(false);
  });
});

describe("rate limits (no database: in-process counters)", () => {
  it("allows up to the limit, then refuses with a retry time", async () => {
    const who = `user-${Math.random()}`;
    for (let i = 0; i < 3; i++) await hitLimit("t", who, 3, 60);
    await expect(hitLimit("t", who, 3, 60)).rejects.toBeInstanceOf(RateLimitError);
    try { await hitLimit("t", who, 3, 60); } catch (e) { expect((e as RateLimitError).retryAfterSeconds).toBeGreaterThan(0); }
    await hitLimit("t", `${who}-other`, 3, 60); // separate subject, separate counter
  });
});
