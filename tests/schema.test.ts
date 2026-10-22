// Database-level rules of the Step 2 schema (prisma/schema.prisma), checked against real PostgreSQL.
// Runs only when PG_TEST_URL points at a THROWAWAY database: it applies the Prisma migrations there, e.g.
//   PG_TEST_URL=postgres://postgres:postgres@localhost:5432/advoflow_test npm test
import { execSync } from "node:child_process";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const url = process.env.PG_TEST_URL;
// The CLI keeps its _prisma_migrations table in "app" here, so other test files that reset "public" cannot interfere.
const cliUrl = url ? `${url}${url.includes("?") ? "&" : "?"}schema=app` : "";
const run = Math.random().toString(36).slice(2, 8);

describe.skipIf(!url)("Prisma schema (app)", () => {
  let db: PrismaClient;
  const A = `office_a_${run}`;
  const B = `office_b_${run}`;

  beforeAll(async () => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: cliUrl, DATABASE_URL_UNPOOLED: cliUrl }, stdio: "pipe" });
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    await db.office.createMany({ data: [{ id: A, name: "Office A" }, { id: B, name: "Office B" }] });
  }, 120_000);

  afterAll(async () => {
    await db?.office.deleteMany({ where: { id: { in: [A, B] } } });
    await db?.$disconnect();
  });

  it("seeds the shared court list", async () => {
    const courts = await db.court.findMany({ where: { officeId: null } });
    expect(courts.length).toBe(35);
    expect(courts.map((c) => c.code)).toEqual(expect.arrayContaining(["IN-SC", "KA-HC-BENGALURU", "KA-HC-DHARWAD", "KA-HC-KALABURAGI", "KA-DC-MYSURU"]));
  });

  it("allows one live case per normalised number in an office, but repeats in other offices and after archiving", async () => {
    const c1 = await db.case.create({ data: { officeId: A, number: "O.S. 482/2025", numberKey: "OS|482|2025" } });
    await expect(db.case.create({ data: { officeId: A, number: "OS 482 of 2025", numberKey: "OS|482|2025" } })).rejects.toThrow();
    await db.case.create({ data: { officeId: B, number: "O.S. 482/2025", numberKey: "OS|482|2025" } });
    await db.case.update({ where: { id: c1.id }, data: { status: "ARCHIVED" } });
    await db.case.create({ data: { officeId: A, number: "O.S. 482/2025", numberKey: "OS|482|2025" } });
    // Unparseable numbers (null key) never collide.
    await db.case.createMany({ data: [{ officeId: A, number: "Misc." }, { officeId: A, number: "Misc." }] });
  });

  it("keeps CNR unique within an office", async () => {
    await db.case.create({ data: { officeId: A, number: "W.P. 1/2024", numberKey: "WP|1|2024", cnr: "KAHC010000012024" } });
    await expect(db.case.create({ data: { officeId: A, number: "W.P. 2/2024", numberKey: "WP|2|2024", cnr: "KAHC010000012024" } })).rejects.toThrow();
  });

  it("cannot link records across offices (composite office keys)", async () => {
    const caseA = await db.case.create({ data: { officeId: A, number: "O.S. 9/2020", numberKey: "OS|9|2020" } });
    const clientB = await db.client.create({ data: { officeId: B, name: "Client of B" } });
    await expect(db.caseClient.create({ data: { officeId: A, caseId: caseA.id, clientId: clientB.id } })).rejects.toThrow();
    await expect(db.task.create({ data: { officeId: B, caseId: caseA.id, title: "Sneaky" } })).rejects.toThrow();
  });

  it("allows many clients per case but only one primary", async () => {
    const c = await db.case.create({ data: { officeId: A, number: "O.S. 10/2020", numberKey: "OS|10|2020" } });
    const [x, y, z] = await Promise.all(["X", "Y", "Z"].map((n) => db.client.create({ data: { officeId: A, name: n } })));
    await db.caseClient.create({ data: { officeId: A, caseId: c.id, clientId: x.id, isPrimary: true } });
    await db.caseClient.create({ data: { officeId: A, caseId: c.id, clientId: y.id } });
    await expect(db.caseClient.create({ data: { officeId: A, caseId: c.id, clientId: z.id, isPrimary: true } })).rejects.toThrow();
    expect(await db.caseClient.count({ where: { caseId: c.id } })).toBe(2);
  });

  it("de-duplicates documents by content and lets a document become only one order", async () => {
    const c = await db.case.create({ data: { officeId: A, number: "O.S. 11/2020", numberKey: "OS|11|2020" } });
    const doc = { officeId: A, filename: "o.txt", mime: "text/plain", size: 10, sha256: "a".repeat(64), storageKey: "k" };
    const d = await db.document.create({ data: doc });
    await expect(db.document.create({ data: doc })).rejects.toThrow();
    await db.courtOrder.create({ data: { officeId: A, caseId: c.id, documentId: d.id, orderDate: new Date("2026-10-01") } });
    await expect(db.courtOrder.create({ data: { officeId: A, caseId: c.id, documentId: d.id } })).rejects.toThrow();
    // An order's original document cannot be deleted while the order exists.
    await expect(db.document.delete({ where: { id: d.id } })).rejects.toThrow();
  });

  it("does not create the same task twice for one de-duplication key", async () => {
    const c = await db.case.create({ data: { officeId: A, number: "O.S. 12/2020", numberKey: "OS|12|2020" } });
    await db.task.create({ data: { officeId: A, caseId: c.id, title: "File WS", dedupeKey: "doc1|file ws" } });
    await expect(db.task.create({ data: { officeId: A, caseId: c.id, title: "File WS", dedupeKey: "doc1|file ws" } })).rejects.toThrow();
    await db.task.createMany({ data: [{ officeId: A, caseId: c.id, title: "Manual" }, { officeId: A, caseId: c.id, title: "Manual" }] });
  });

  it("keeps hearing history: a moved date is superseded and linked to the new one", async () => {
    const c = await db.case.create({ data: { officeId: A, number: "O.S. 13/2020", numberKey: "OS|13|2020" } });
    const oldH = await db.hearing.create({ data: { officeId: A, caseId: c.id, date: new Date("2026-10-27"), status: "CONFIRMED" } });
    const newH = await db.hearing.create({ data: { officeId: A, caseId: c.id, date: new Date("2026-10-29"), status: "AWAITING_VERIFICATION" } });
    await db.hearing.update({ where: { id: oldH.id }, data: { status: "SUPERSEDED", supersededById: newH.id } });
    const hist = await db.hearing.findMany({ where: { caseId: c.id }, orderBy: { date: "asc" }, include: { supersededBy: true } });
    expect(hist.map((h) => h.status)).toEqual(["SUPERSEDED", "AWAITING_VERIFICATION"]);
    expect(hist[0].supersededBy?.id).toBe(newH.id);
    expect(hist[0].date.toISOString().slice(0, 10)).toBe("2026-10-27"); // @db.Date: no time-zone drift
  });

  it("numbers research versions per report and blocks duplicates", async () => {
    const c = await db.case.create({ data: { officeId: A, number: "O.S. 14/2020", numberKey: "OS|14|2020" } });
    const r = await db.researchReport.create({ data: { officeId: A, caseId: c.id, title: "Q" } });
    const v = { officeId: A, reportId: r.id, question: "Q", mode: "RULES" as const, pipeline: "demo-rules/ecourts-opendata", summary: "S" };
    await db.researchVersion.create({ data: { ...v, version: 1 } });
    await expect(db.researchVersion.create({ data: { ...v, version: 1 } })).rejects.toThrow();
    const v2 = await db.researchVersion.create({ data: { ...v, version: 2 } });
    await db.researchAuthority.create({ data: { officeId: A, versionId: v2.id, connector: "ecourts-opendata", sourceId: "sc:x", judgmentId: "sc:x", name: "A v. B", court: "Supreme Court of India", verification: "SOURCE_RETRIEVED" } });
    await expect(db.researchAuthority.create({ data: { officeId: A, versionId: v2.id, connector: "ecourts-opendata", sourceId: "sc:x", name: "A v. B", court: "Supreme Court of India", verification: "SOURCE_RETRIEVED" } })).rejects.toThrow();
  });

  it("deleting an office removes all of its records and nothing else", async () => {
    const T = `office_t_${run}`;
    await db.office.create({ data: { id: T, name: "Temp" } });
    const c = await db.case.create({ data: { officeId: T, number: "O.S. 1/2026", numberKey: "OS|1|2026" } });
    await db.task.create({ data: { officeId: T, caseId: c.id, title: "t" } });
    const before = await db.case.count({ where: { officeId: A } });
    await db.office.delete({ where: { id: T } });
    expect(await db.case.count({ where: { officeId: T } })).toBe(0);
    expect(await db.task.count({ where: { officeId: T } })).toBe(0);
    expect(await db.case.count({ where: { officeId: A } })).toBe(before);
    expect(await db.court.count({ where: { officeId: null } })).toBe(35);
  });
});
