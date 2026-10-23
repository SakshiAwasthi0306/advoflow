import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  AuditEntry, Authority, CaseRecord, Client, ClientUpdate, CourtOrder, DateChange, DocumentRecord, Extraction, FieldReview, Hearing,
  Member, ProcessingJob, ResearchReport, ResearchVersion, Role, Task, Workspace,
} from "../types";
import { ConflictError, type WorkspaceStore } from "./types";

/**
 * PostgreSQL store on the Step 2 data model (schema "app"), through Prisma.
 *
 * The app's services still work on one office "Workspace" at a time. This store assembles that aggregate from the
 * normalised tables, and on save writes ONLY the rows that changed since it was loaded (create / update / delete),
 * in one transaction, after bumping Office.version with a compare-and-set (optimistic locking: a stale save throws
 * ConflictError and `mutate()` retries on fresh data). Every query is filtered by officeId.
 */

type Tx = Prisma.TransactionClient;
type Row = Record<string, unknown> & { id: string };
type Rows = Record<TableName, Row[]>;
type TableName = (typeof WRITE_ORDER)[number];

// Parents before children; deletes run in reverse. Hearing is written in two passes (self-reference).
const WRITE_ORDER = [
  "client", "case", "caseParty", "caseClient", "document", "extractionJob", "courtOrder", "hearing", "hearingDateChange",
  "researchReport", "researchVersion", "researchAuthority", "savedAuthority", "researchNote", "task", "clientMessage",
] as const;

// Tables no other table references: their removed rows can be deleted before anything else is written.
const LEAF = new Set<TableName>(["caseParty", "caseClient", "savedAuthority", "researchNote", "task", "clientMessage", "hearingDateChange"]);

const PLACEHOLDER_EMAIL = "@placeholder.invalid"; // demo/system members without a real email address

// ---------------------------------------------------------------- small converters

const up = <T extends string>(s: string) => s.toUpperCase() as T;
const low = <T extends string>(s: string) => s.toLowerCase() as T;
const day = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00.000Z`) : null);
const iso = (d: Date) => d.toISOString();
const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const ts = (s: string | null | undefined) => (s ? new Date(s) : null);
const EXTRACTOR = { "demo-rules": "DEMO_RULES", anthropic: "ANTHROPIC", gemini: "GEMINI", openrouter: "OPENROUTER", "case-diary-import": "CASE_DIARY_IMPORT" } as const;
const dbRole = (r: Role) => r.toUpperCase() as "OWNER" | "ADVOCATE" | "CLERK" | "VIEWER";
const versionId = (reportId: string, v: number) => `${reportId}_v${v}`;
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

/** Timestamps the Workspace does not carry (e.g. when an authority was reviewed) are kept from the database. */
type Stamps = Map<string, Date>;

// ---------------------------------------------------------------- Workspace -> rows

function toRows(ws: Workspace, stamps: Stamps, now: Date): Rows {
  const o = ws.office.id;
  const stamp = (key: string, on: boolean) => (on ? stamps.get(key) ?? now : null);
  const clientIds = new Set(ws.clients.map((c) => c.id));
  const rows: Rows = Object.fromEntries(WRITE_ORDER.map((t) => [t, []])) as unknown as Rows;

  for (const c of ws.clients) {
    rows.client.push({
      id: c.id, officeId: o, name: c.name, phone: c.phone, email: c.email, preferredLanguage: up(c.preferredLanguage),
      preferredChannel: up(c.preferredChannel), notes: c.notes, isDemo: c.isDemo, createdAt: ts(c.createdAt), updatedAt: ts(c.updatedAt),
    });
  }
  for (const c of ws.cases) {
    rows.case.push({
      id: c.id, officeId: o, number: c.number, numberKey: c.numberKey, cnr: c.cnr, caseType: c.caseType, title: c.title,
      courtName: c.court, stage: c.stage, status: up(c.status), isDemo: c.isDemo, createdAt: ts(c.createdAt), updatedAt: ts(c.updatedAt),
    });
    if (c.parties.petitioner) rows.caseParty.push({ id: `${c.id}_pet`, officeId: o, caseId: c.id, side: "PETITIONER", name: c.parties.petitioner, position: 0 });
    if (c.parties.respondent) rows.caseParty.push({ id: `${c.id}_res`, officeId: o, caseId: c.id, side: "RESPONDENT", name: c.parties.respondent, position: 0 });
    // The app links one client per case; it is stored as the case's primary client.
    if (c.clientId && clientIds.has(c.clientId)) rows.caseClient.push({ id: `${c.id}|${c.clientId}`, officeId: o, caseId: c.id, clientId: c.clientId, isPrimary: true });
  }
  for (const d of ws.documents) {
    rows.document.push({
      id: d.id, officeId: o, caseId: d.caseId, filename: d.filename, mime: d.mime, size: d.size, sha256: d.sha256, storageKey: d.storageKey,
      kind: up(d.kind), textExtract: d.textExtract, textSource: up(d.textSource), isDemo: d.isDemo, uploadedById: d.uploadedBy, createdAt: ts(d.createdAt),
    });
  }
  for (const j of ws.jobs) {
    rows.extractionJob.push({
      id: j.id, officeId: o, documentId: j.documentId, idempotencyKey: j.idempotencyKey, status: up(j.status),
      extractor: EXTRACTOR[j.extraction?.extractor ?? "demo-rules"], model: j.extraction?.model ?? null, hint: asJson(j.hint),
      extraction: j.extraction ? asJson(j.extraction) : Prisma.DbNull, match: j.match ? asJson(j.match) : Prisma.DbNull, conflicts: j.conflicts,
      error: j.error, createdById: j.createdBy, decidedById: j.decidedBy, decidedAt: ts(j.decidedAt), createdAt: ts(j.createdAt),
    });
  }
  for (const r of ws.orders) {
    rows.courtOrder.push({
      id: r.id, officeId: o, caseId: r.caseId, documentId: r.documentId, jobId: r.jobId, orderDate: day(r.orderDate), summary: r.summary,
      stage: r.stage, adjourned: r.adjourned, costs: r.costs, directions: r.directions, nextHearingDate: day(r.nextHearingDate),
      nextHearingConfirmed: r.nextHearingConfirmed, approvedFields: r.approvedFields,
      extractionSnapshot: r.extractionSnapshot ? asJson(r.extractionSnapshot) : Prisma.DbNull, fieldReview: r.fieldReview ? asJson(r.fieldReview) : Prisma.DbNull, approvedById: r.approvedBy, approvedAt: ts(r.approvedAt), isDemo: r.isDemo,
    });
  }
  for (const h of ws.hearings) {
    rows.hearing.push({
      id: h.id, officeId: o, caseId: h.caseId, date: day(h.date), purpose: h.purpose, status: up(h.status), sourceOrderId: h.sourceOrderId,
      supersededById: h.supersededById, confirmedById: h.confirmedBy, confirmedAt: ts(h.confirmedAt), createdAt: ts(h.createdAt),
    });
  }
  for (const d of ws.dateChanges) {
    rows.hearingDateChange.push({
      id: d.id, officeId: o, caseId: d.caseId, fromDate: day(d.from), toDate: day(d.to), orderId: d.orderId, affectedTaskIds: d.affectedTaskIds,
      reviewed: d.reviewed, createdAt: ts(d.at),
    });
  }
  for (const rep of ws.research) {
    rows.researchReport.push({ id: rep.id, officeId: o, caseId: rep.caseId, title: rep.title, createdAt: ts(rep.createdAt) });
    for (const v of rep.versions) {
      const vid = versionId(rep.id, v.version);
      rows.researchVersion.push({
        id: vid, officeId: o, reportId: rep.id, version: v.version, question: v.question, mode: up(v.mode), pipeline: v.pipeline, status: up(v.status),
        summary: v.summary, orderIds: v.orderIds, documentIds: v.documentIds, issues: asJson(v.issues), provisions: asJson(v.provisions),
        arguments: asJson(v.arguments), counterarguments: asJson(v.counterarguments), missingFacts: asJson(v.missingFacts), nextSteps: asJson(v.nextSteps),
        limitations: asJson(v.limitations), sourcesChecked: asJson(v.sourcesChecked), bookmarkedProvisionIds: v.bookmarkedProvisionIds,
        createdById: v.createdBy, createdAt: ts(v.createdAt), reviewedAt: stamp(`version:${vid}`, v.status === "reviewed"),
      });
      v.authorities.forEach((a, position) => {
        rows.researchAuthority.push({
          id: a.id, officeId: o, versionId: vid, connector: a.connector, sourceId: a.sourceId, judgmentId: a.connector === "ecourts-opendata" ? a.sourceId : null,
          name: a.name, citation: a.citation, court: a.court, decisionDate: day(a.decisionDate), bench: a.bench, url: a.url, issue: a.issue,
          materialFacts: a.materialFacts, principle: a.principle, relevance: a.relevance, distinctions: a.distinctions, passages: asJson(a.passages),
          treatment: a.treatment, stance: up(a.stance), bindingness: up(a.bindingness), verification: up(a.verification), isFictional: a.fictional,
          reviewedAt: stamp(`authority:${a.id}`, v.reviewedAuthorityIds.includes(a.id)), position,
        });
      });
      for (const id of v.savedAuthorityIds) {
        if (v.authorities.some((a) => a.id === id)) rows.savedAuthority.push({ id: `sav_${id}`, officeId: o, caseId: rep.caseId, authorityId: id });
      }
      for (const n of v.notes) {
        rows.researchNote.push({ id: n.id, officeId: o, versionId: vid, text: n.text, author: up(n.author), authorId: n.authorId, createdAt: ts(n.createdAt) });
      }
    }
  }
  for (const t of ws.tasks) {
    rows.task.push({
      id: t.id, officeId: o, caseId: t.caseId, title: t.title, description: t.description, dueDate: day(t.dueDate), priority: up(t.priority),
      status: up(t.status), source: up(t.source), sourceOrderId: t.sourceOrderId, sourceReportId: t.sourceReportId, dedupeKey: t.dedupeKey,
      assigneeId: t.assigneeId, rescheduleFrom: day(t.needsReschedule?.from), rescheduleTo: day(t.needsReschedule?.to), createdById: t.createdBy,
      createdAt: ts(t.createdAt), completedAt: ts(t.completedAt),
    });
  }
  for (const u of ws.clientUpdates) {
    rows.clientMessage.push({
      id: u.id, officeId: o, caseId: u.caseId, clientId: u.clientId && clientIds.has(u.clientId) ? u.clientId : null, lang: up(u.lang), text: u.text,
      status: up(u.status), sourceOrderId: u.sourceOrderId, handedOffAt: ts(u.handedOffAt), createdAt: ts(u.createdAt), updatedAt: ts(u.updatedAt),
    });
  }
  return rows;
}

// ---------------------------------------------------------------- rows -> Workspace

async function readOffice(db: PrismaClient | Tx, officeId: string) {
  const where = { officeId };
  const byCreated = { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] };
  const office = await db.office.findUnique({ where: { id: officeId } });
  if (!office) return null;
  const [memberships, clients, cases, parties, caseClients, documents, jobs, orders, hearings, changes, reports, versions, authorities, saved, notes, tasks, messages, audit] =
    await Promise.all([
      db.membership.findMany({ where, include: { user: true }, ...byCreated }),
      db.client.findMany({ where, ...byCreated }),
      db.case.findMany({ where, ...byCreated }),
      db.caseParty.findMany({ where }),
      db.caseClient.findMany({ where }),
      db.document.findMany({ where, ...byCreated }),
      db.extractionJob.findMany({ where, ...byCreated }),
      db.courtOrder.findMany({ where, orderBy: [{ approvedAt: "asc" }, { id: "asc" }] }),
      db.hearing.findMany({ where, ...byCreated }),
      db.hearingDateChange.findMany({ where, ...byCreated }),
      db.researchReport.findMany({ where, ...byCreated }),
      db.researchVersion.findMany({ where, orderBy: [{ reportId: "asc" }, { version: "asc" }] }),
      db.researchAuthority.findMany({ where, orderBy: [{ versionId: "asc" }, { position: "asc" }] }),
      db.savedAuthority.findMany({ where }),
      db.researchNote.findMany({ where, ...byCreated }),
      db.task.findMany({ where, ...byCreated }),
      db.clientMessage.findMany({ where, ...byCreated }),
      db.auditLog.findMany({ where, orderBy: [{ at: "asc" }, { id: "asc" }] }),
    ]);

  const stamps: Stamps = new Map();
  const primaryClient = new Map(caseClients.filter((x) => x.isPrimary).map((x) => [x.caseId, x.clientId]));
  const partyOf = (caseId: string, side: "PETITIONER" | "RESPONDENT") => parties.find((p) => p.caseId === caseId && p.side === side)?.name ?? "";
  const orderOfJob = new Map(orders.filter((r) => r.jobId).map((r) => [r.jobId!, r.id]));
  const savedIds = new Set(saved.map((s) => s.authorityId));

  const ws: Workspace = {
    office: { id: office.id, name: office.name, createdAt: iso(office.createdAt) },
    version: office.version,
    demoLoaded: office.demoLoaded,
    members: memberships.map((m): Member => ({ userId: m.userId, name: m.user.name, email: m.user.email.endsWith(PLACEHOLDER_EMAIL) ? "" : m.user.email, role: low<Role>(m.role) })),
    clients: clients.map((c): Client => ({
      id: c.id, name: c.name, phone: c.phone, email: c.email, preferredLanguage: low(c.preferredLanguage), preferredChannel: low(c.preferredChannel),
      notes: c.notes, isDemo: c.isDemo, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt),
    })),
    cases: cases.map((c): CaseRecord => ({
      id: c.id, number: c.number, numberKey: c.numberKey, cnr: c.cnr, title: c.title,
      parties: { petitioner: partyOf(c.id, "PETITIONER"), respondent: partyOf(c.id, "RESPONDENT") },
      court: c.courtName, caseType: c.caseType, stage: c.stage, clientId: primaryClient.get(c.id) ?? null, status: low(c.status), isDemo: c.isDemo,
      createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt),
    })),
    documents: documents.map((d): DocumentRecord => ({
      id: d.id, caseId: d.caseId, filename: d.filename, mime: d.mime, size: d.size, sha256: d.sha256, storageKey: d.storageKey, kind: low(d.kind),
      textExtract: d.textExtract, textSource: low(d.textSource), isDemo: d.isDemo, uploadedBy: d.uploadedById ?? "", createdAt: iso(d.createdAt),
    })),
    jobs: jobs.map((j): ProcessingJob => ({
      id: j.id, documentId: j.documentId, idempotencyKey: j.idempotencyKey, hint: j.hint as ProcessingJob["hint"], status: low(j.status), error: j.error,
      extraction: (j.extraction as Extraction | null) ?? null, match: (j.match as ProcessingJob["match"]) ?? null, conflicts: j.conflicts,
      createdBy: j.createdById ?? "", createdAt: iso(j.createdAt), decidedAt: j.decidedAt ? iso(j.decidedAt) : null, decidedBy: j.decidedById,
      resultOrderId: orderOfJob.get(j.id) ?? null,
    })),
    orders: orders.map((r): CourtOrder => ({
      id: r.id, caseId: r.caseId, documentId: r.documentId, jobId: r.jobId, orderDate: isoDay(r.orderDate), summary: r.summary, stage: r.stage,
      adjourned: r.adjourned, costs: r.costs, directions: r.directions, nextHearingDate: isoDay(r.nextHearingDate), nextHearingConfirmed: r.nextHearingConfirmed,
      approvedFields: r.approvedFields, extractionSnapshot: (r.extractionSnapshot as Extraction | null) ?? null, ...(r.fieldReview ? { fieldReview: r.fieldReview as unknown as FieldReview } : {}), approvedBy: r.approvedById ?? "",
      approvedAt: iso(r.approvedAt), isDemo: r.isDemo,
    })),
    hearings: hearings.map((h): Hearing => ({
      id: h.id, caseId: h.caseId, date: isoDay(h.date)!, purpose: h.purpose, status: low(h.status), sourceOrderId: h.sourceOrderId,
      supersededById: h.supersededById, confirmedBy: h.confirmedById, confirmedAt: h.confirmedAt ? iso(h.confirmedAt) : null, createdAt: iso(h.createdAt),
    })),
    dateChanges: changes.map((d): DateChange => ({
      id: d.id, caseId: d.caseId, from: isoDay(d.fromDate)!, to: isoDay(d.toDate)!, orderId: d.orderId, at: iso(d.createdAt),
      affectedTaskIds: d.affectedTaskIds, reviewed: d.reviewed,
    })),
    tasks: tasks.map((t): Task => ({
      id: t.id, caseId: t.caseId, title: t.title, description: t.description, dueDate: isoDay(t.dueDate), priority: low(t.priority), status: low(t.status),
      source: t.source === "IMPORT" ? "manual" : low(t.source), sourceOrderId: t.sourceOrderId, sourceReportId: t.sourceReportId, dedupeKey: t.dedupeKey,
      assigneeId: t.assigneeId, needsReschedule: t.rescheduleFrom && t.rescheduleTo ? { from: isoDay(t.rescheduleFrom)!, to: isoDay(t.rescheduleTo)! } : null,
      createdBy: t.createdById ?? "", createdAt: iso(t.createdAt), completedAt: t.completedAt ? iso(t.completedAt) : null,
    })),
    clientUpdates: messages.map((u): ClientUpdate => ({
      id: u.id, caseId: u.caseId, clientId: u.clientId, lang: low(u.lang), text: u.text, status: low(u.status), sourceOrderId: u.sourceOrderId,
      createdAt: iso(u.createdAt), updatedAt: iso(u.updatedAt), handedOffAt: u.handedOffAt ? iso(u.handedOffAt) : null,
    })),
    research: reports.map((rep): ResearchReport => ({
      id: rep.id, caseId: rep.caseId, title: rep.title, createdAt: iso(rep.createdAt),
      versions: versions.filter((v) => v.reportId === rep.id).map((v): ResearchVersion => {
        if (v.reviewedAt) stamps.set(`version:${v.id}`, v.reviewedAt);
        const auths = authorities.filter((a) => a.versionId === v.id);
        for (const a of auths) if (a.reviewedAt) stamps.set(`authority:${a.id}`, a.reviewedAt);
        return {
          version: v.version, createdAt: iso(v.createdAt), createdBy: v.createdById ?? "", mode: low(v.mode), pipeline: v.pipeline, question: v.question,
          orderIds: v.orderIds, documentIds: v.documentIds, status: low(v.status), summary: v.summary,
          issues: v.issues as unknown as ResearchVersion["issues"], provisions: v.provisions as unknown as ResearchVersion["provisions"],
          authorities: auths.map((a): Authority => ({
            id: a.id, sourceId: a.sourceId, connector: a.connector, name: a.name, citation: a.citation, court: a.court, decisionDate: isoDay(a.decisionDate),
            bench: a.bench, issue: a.issue, materialFacts: a.materialFacts, principle: a.principle, passages: a.passages as unknown as Authority["passages"],
            relevance: a.relevance, distinctions: a.distinctions, stance: low(a.stance), bindingness: low(a.bindingness), treatment: a.treatment, url: a.url,
            verification: low(a.verification), fictional: a.isFictional,
          })),
          arguments: v.arguments as unknown as ResearchVersion["arguments"], counterarguments: v.counterarguments as unknown as ResearchVersion["counterarguments"],
          missingFacts: v.missingFacts as unknown as string[], nextSteps: v.nextSteps as unknown as ResearchVersion["nextSteps"],
          limitations: v.limitations as unknown as string[], sourcesChecked: v.sourcesChecked as unknown as ResearchVersion["sourcesChecked"],
          notes: notes.filter((n) => n.versionId === v.id).map((n) => ({ id: n.id, text: n.text, author: low(n.author), authorId: n.authorId, createdAt: iso(n.createdAt) })),
          reviewedAuthorityIds: auths.filter((a) => a.reviewedAt).map((a) => a.id),
          savedAuthorityIds: auths.filter((a) => savedIds.has(a.id)).map((a) => a.id),
          bookmarkedProvisionIds: v.bookmarkedProvisionIds,
        };
      }),
    })),
    audit: audit.map((a): AuditEntry => ({ id: a.id, at: iso(a.at), userId: a.userId ?? "", action: a.action, entity: a.entity, entityId: a.entityId, caseId: a.caseId, detail: a.detail })),
  };
  return { ws, stamps };
}

// ---------------------------------------------------------------- the store

const fingerprint = (r: Row) => JSON.stringify(r, (_k, v) => (v === Prisma.DbNull ? null : v));

export class PrismaStore implements WorkspaceStore {
  readonly kind = "postgres" as const;
  private db: PrismaClient;
  /** What each loaded Workspace looked like in the database, so a save writes only the differences. */
  private loaded = new WeakMap<Workspace, { rows: Map<string, string>; stamps: Stamps; audit: Set<string> }>();

  constructor(urlOrClient: string | PrismaClient) {
    this.db = typeof urlOrClient === "string" ? new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOrClient, max: 5 }) }) : urlOrClient;
  }

  async close() {
    await this.db.$disconnect();
  }

  private remember(ws: Workspace, stamps: Stamps, now = new Date()) {
    const rows = toRows(ws, stamps, now);
    const map = new Map<string, string>();
    for (const t of WRITE_ORDER) for (const r of rows[t]) map.set(`${t}:${r.id}`, fingerprint(r));
    this.loaded.set(ws, { rows: map, stamps, audit: new Set(ws.audit.map((a) => a.id)) });
  }

  async load(officeId: string): Promise<Workspace | null> {
    const r = await readOffice(this.db, officeId);
    if (!r) return null;
    this.remember(r.ws, r.stamps);
    return r.ws;
  }

  async createOffice(ws: Workspace) {
    await this.db.$transaction(async (tx) => {
      const created = await tx.office.createMany({ data: [{ id: ws.office.id, name: ws.office.name, demoLoaded: ws.demoLoaded, createdAt: new Date(ws.office.createdAt) }], skipDuplicates: true });
      if (created.count === 0) return; // already exists
      await syncMembers(tx, ws.office.id, ws.members);
    });
  }

  async save(ws: Workspace, expectedVersion: number) {
    const known = this.loaded.get(ws) ?? (await this.snapshotOf(ws.office.id));
    const now = new Date();
    const rows = toRows(ws, known.stamps, now);

    await this.db.$transaction(async (tx) => {
      const bumped = await tx.office.updateMany({
        where: { id: ws.office.id, version: expectedVersion },
        data: { version: { increment: 1 }, name: ws.office.name, demoLoaded: ws.demoLoaded },
      });
      if (bumped.count !== 1) throw new ConflictError();

      const current = new Set<string>();
      const creates = new Map<TableName, Row[]>();
      const updates: [TableName, Row][] = [];
      for (const t of WRITE_ORDER) {
        for (const r of rows[t]) {
          const key = `${t}:${r.id}`;
          current.add(key);
          const before = known.rows.get(key);
          if (before === undefined) creates.set(t, [...(creates.get(t) ?? []), r]);
          else if (before !== fingerprint(r)) updates.push([t, r]);
        }
      }
      // Order matters for foreign keys and unique indexes:
      //   1. delete gone rows nothing else points at (frees unique slots, e.g. a case's primary-client link);
      //   2. create new rows, parents first (new hearings without their "superseded by" link);
      //   3. apply updates (they may point at rows created in step 2), then re-link hearings;
      //   4. delete the remaining gone rows, children first (by now nothing surviving points at them).
      // Rows are always matched by id AND officeId, so another office's rows can never be touched.
      const gone = (t: TableName) => [...known.rows.keys()].filter((k) => k.startsWith(`${t}:`) && !current.has(k)).map((k) => k.slice(t.length + 1));
      for (const t of [...WRITE_ORDER].reverse()) if (LEAF.has(t) && gone(t).length) await deleteRows(tx, t, ws.office.id, gone(t));
      const relink: Row[] = [];
      for (const t of WRITE_ORDER) {
        const fresh = creates.get(t) ?? [];
        if (!fresh.length) continue;
        const data = t === "hearing" ? fresh.map((r) => (r.supersededById ? (relink.push(r), { ...r, supersededById: null }) : r)) : fresh;
        await createRows(tx, t, data);
      }
      for (const [t, r] of updates) await updateRow(tx, t, ws.office.id, r);
      for (const r of relink) await updateRow(tx, "hearing", ws.office.id, r);
      for (const t of [...WRITE_ORDER].reverse()) if (!LEAF.has(t) && gone(t).length) await deleteRows(tx, t, ws.office.id, gone(t));

      const newAudit = ws.audit.filter((a) => !known.audit.has(a.id));
      if (newAudit.length) {
        await tx.auditLog.createMany({
          data: newAudit.map((a) => ({ id: a.id, officeId: ws.office.id, userId: a.userId || null, action: a.action, entity: a.entity, entityId: a.entityId, caseId: a.caseId, detail: a.detail, at: new Date(a.at) })),
          skipDuplicates: true,
        });
      }
      await syncMembers(tx, ws.office.id, ws.members);
    }, { timeout: 30_000, maxWait: 10_000 });

    ws.version = expectedVersion + 1;
    const stamps = new Map(known.stamps);
    for (const r of rows.researchVersion) if (r.reviewedAt) stamps.set(`version:${r.id}`, r.reviewedAt as Date);
    for (const r of rows.researchAuthority) if (r.reviewedAt) stamps.set(`authority:${r.id}`, r.reviewedAt as Date);
    this.remember(ws, stamps, now);
  }

  /** For a Workspace this store did not load (e.g. built in a test), compare against what is in the database now. */
  private async snapshotOf(officeId: string) {
    const r = await readOffice(this.db, officeId);
    if (!r) return { rows: new Map<string, string>(), stamps: new Map() as Stamps, audit: new Set<string>() };
    this.remember(r.ws, r.stamps);
    return this.loaded.get(r.ws)!;
  }
}

/** Members listed on the Workspace get a User (placeholder email if none) and a Membership. Removal is not done here. */
async function syncMembers(tx: Tx, officeId: string, members: Member[]) {
  for (const m of members) {
    const email = (m.email || `${m.userId}${PLACEHOLDER_EMAIL}`).toLowerCase();
    await tx.user.upsert({ where: { id: m.userId }, create: { id: m.userId, email, name: m.name }, update: {} });
    await tx.membership.upsert({
      where: { officeId_userId: { officeId, userId: m.userId } },
      create: { officeId, userId: m.userId, role: dbRole(m.role) },
      update: { role: dbRole(m.role) },
    });
  }
}

// Generic per-table writes. Prisma's delegates share these method shapes; the casts keep the call sites short.
type Delegate = {
  createMany(args: { data: unknown[] }): Promise<unknown>;
  updateMany(args: { where: unknown; data: unknown }): Promise<{ count: number }>;
  deleteMany(args: { where: unknown }): Promise<unknown>;
};
const delegate = (tx: Tx, t: TableName) => (tx as unknown as Record<string, Delegate>)[t];

async function createRows(tx: Tx, t: TableName, rows: Row[]) {
  if (t === "caseClient") {
    await tx.caseClient.createMany({ data: rows.map(({ id: _id, ...r }) => r) as Prisma.CaseClientCreateManyInput[] });
    return;
  }
  await delegate(tx, t).createMany({ data: rows });
}

async function updateRow(tx: Tx, t: TableName, officeId: string, r: Row) {
  if (t === "caseClient") {
    const { id: _id, caseId, clientId, ...rest } = r as Row & { caseId: string; clientId: string };
    await tx.caseClient.updateMany({ where: { officeId, caseId, clientId }, data: rest as Prisma.CaseClientUpdateManyMutationInput });
    return;
  }
  const { id, ...data } = r;
  const res = await delegate(tx, t).updateMany({ where: { id, officeId }, data });
  if (res.count !== 1) throw new ConflictError();
}

async function deleteRows(tx: Tx, t: TableName, officeId: string, ids: string[]) {
  if (t === "caseClient") {
    for (const key of ids) {
      const [caseId, clientId] = key.split("|");
      await tx.caseClient.deleteMany({ where: { officeId, caseId, clientId } });
    }
    return;
  }
  if (t === "hearing") {
    // Clear "superseded by" links into the hearings being removed first (self-reference).
    await tx.hearing.updateMany({ where: { officeId, supersededById: { in: ids } }, data: { supersededById: null } });
  }
  await delegate(tx, t).deleteMany({ where: { officeId, id: { in: ids } } });
}
