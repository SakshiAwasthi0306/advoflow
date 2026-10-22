# Step 2 — Requirements and data model (proposal, for confirmation)

Status: **implemented as a schema and migrations, tested; not yet applied to production.**
Schema: `prisma/schema.prisma` · migrations: `prisma/migrations/` · rules tested by `tests/schema.test.ts`.

Confirmed decisions (22 Oct 2026): many clients per case with one primary · courts as a seeded reference list plus free text · research versions stored as a fixed JSON snapshot with cited judgments in their own table · production starts fresh on the new schema and the demo is re-seeded (it held only fictional demo records).

## 1. Requirements the model must support

From the product vision, the Case Diary and what the app already does:

| # | Requirement | Consequence for the data model |
|---|---|---|
| R1 | An advocate's office has several people with different permissions (owner, advocate, clerk, viewer) | `Office`, `User`, `Membership(role)`; every business row carries `officeId` |
| R2 | One office must never see another's data | `officeId` on every row, in every unique key and index; checked server-side |
| R3 | Cases are identified by Indian case numbers written many ways ("O.S. 482/2025", "OS 482 of 2025") and by CNR | stored as written + a normalised key; unique per office among live cases; CNR unique per office |
| R4 | A case has parties, a court, a stage, and the side we act for | `Case`, `CaseParty`, `Court` |
| R5 | Clients can be linked to cases and receive updates in English or Kannada | `Client`, `CaseClient` (confirm one vs many), `ClientMessage(lang)` |
| R6 | Orders are uploaded, read (rules or AI), **reviewed by an advocate**, then saved; the original and the AI's proposal are kept | `Document` → `ExtractionJob` → `CourtOrder` (approved fields only) with the extraction snapshot |
| R7 | Hearing dates have a history: proposed, confirmed, held, superseded, cancelled; date changes flag tasks, never silently move them | `Hearing(status, supersededBy)`, `HearingDateChange`, `Task.rescheduleFrom/To` |
| R8 | Tasks come from orders, research or by hand; due dates, priority, assignee, done | `Task(source, priority, status, assigneeId)` with a de-duplication key |
| R9 | Legal research is versioned; old versions never change; each authority records its source and whether it is fictional, retrieved or reviewed | `ResearchReport` → `ResearchVersion` (immutable) → `ResearchAuthority`; `SavedAuthority` |
| R10 | Real judgments from public sources are shared reference data, not office data | `Judgment` (existing `legal_judgments`, kept as is) |
| R11 | Everything that changes records is auditable | `AuditLog` (append-only) |
| R12 | Calendar export and reports are computed from stored records | no extra tables; indexes on dates and status |
| R13 | Demo data is always labelled and removable | `isDemo` on offices' business rows |

Out of scope for Step 2: authentication flows, AI prompts, UI. Notifications, billing/fees, time tracking and eCourts sync are not modelled yet.

## 2. Entities

```
Office ─┬─ Membership ── User
        ├─ Court* (reference, shared + office-specific)
        ├─ Client ── CaseClient ──┐
        ├─ Case ──────────────────┴─ CaseParty
        │    ├─ Document ── ExtractionJob
        │    ├─ CourtOrder (from one Document)
        │    ├─ Hearing ── HearingDateChange
        │    ├─ Task
        │    ├─ ClientMessage
        │    └─ ResearchReport ── ResearchVersion ── ResearchAuthority ── (Judgment, shared)
        │                                        └─ ResearchNote
        └─ AuditLog
```

| Model | Key fields | Notes |
|---|---|---|
| `Office` | name, createdAt | tenant root |
| `User` | email (unique), name, passwordHash, isActive | auth itself comes later |
| `Membership` | officeId, userId, role `OWNER/ADVOCATE/CLERK/VIEWER` | unique (officeId, userId) |
| `Court` | name, level `SUPREME/HIGH/DISTRICT/TRIBUNAL/OTHER`, state, district, bench, code | seeded with 35 courts (Supreme Court, 3 Karnataka HC benches, Bengaluru City Civil Court, 30 district courts); offices can add their own |
| `Client` | name, phone, email, preferredLanguage `EN/KN`, preferredChannel, notes, isDemo | |
| `Case` | number, numberKey, cnr, caseType, title, courtId / courtName, stage, status `ACTIVE/CLOSED/ARCHIVED`, actingFor `PETITIONER/RESPONDENT/OTHER`, filedOn, isDemo | partial unique (officeId, numberKey) where not archived; unique (officeId, cnr) |
| `CaseParty` | caseId, role `PETITIONER/RESPONDENT/OTHER`, name, position | replaces the single "parties" text |
| `CaseClient` | caseId, clientId, isPrimary | many clients per case; at most one primary (partial unique index) |
| `Document` | caseId?, filename, mime, size, sha256, storageKey, kind, textExtract, textSource, uploadedById | unique (officeId, sha256) for idempotent uploads |
| `ExtractionJob` | documentId, status `NEEDS_REVIEW/APPROVED/REJECTED/FAILED`, extractor, model, extraction (JSON), match (JSON), decidedById/At | AI output kept as a JSON snapshot on purpose: it is evidence of what was proposed |
| `CourtOrder` | caseId, documentId (unique), jobId, orderDate, summary, stage, adjourned, costs, directions (text[]), nextHearingDate, nextHearingConfirmed, approvedFields (text[]), approvedById/At | only advocate-approved values |
| `Hearing` | caseId, date, purpose, status `AWAITING_VERIFICATION/CONFIRMED/HELD/SUPERSEDED/CANCELLED`, sourceOrderId, supersededById, confirmedById/At | history never deleted |
| `HearingDateChange` | caseId, fromDate, toDate, orderId, reviewed | |
| `Task` | caseId, title, description, dueDate, priority `HIGH/NORMAL/LOW`, status `OPEN/DONE`, source `MANUAL/ORDER/RESEARCH/IMPORT`, sourceOrderId, sourceVersionId, dedupeKey, assigneeId, rescheduleFrom/To, completedAt | unique (officeId, caseId, dedupeKey) |
| `ClientMessage` | caseId, clientId?, lang `EN/KN`, text, status `DRAFT/APPROVED/HANDED_OFF`, channel, sourceOrderId, handedOffAt | "handed off" ≠ delivered |
| `ResearchReport` | caseId, title | |
| `ResearchVersion` | reportId, version, question, mode, pipeline, status, summary, issues/provisions/arguments/nextSteps/limitations/sourcesChecked (JSON), orderIds | immutable after creation except review status and notes; analysis kept as a JSON snapshot |
| `ResearchAuthority` | versionId, judgmentId?, connector, sourceId, name, citation, court, decisionDate, passages (JSON), stance, bindingness, verification `FICTIONAL_DEMO/UNVERIFIED/SOURCE_RETRIEVED/ADVOCATE_REVIEWED`, isFictional | metadata copied from the source record, never from the model |
| `SavedAuthority` | caseId, authorityId, savedById | "save to case" across versions |
| `ResearchNote` | versionId, text, author `ADVOCATE/AI`, authorId | |
| (judgments) | existing `public.legal_judgments` | shared, read-only, **outside the Prisma schema** (full-text column, loaded by `scripts/judgments/`); `ResearchAuthority.judgmentId` holds its id without a foreign key |
| `AuditLog` | officeId, userId, action, entity, entityId, caseId, detail, at | append-only |

Conventions: string ids (`cuid`), `createdAt`/`updatedAt` on every table, calendar dates as `@db.Date`, money/costs kept as text (orders state them in words), enums for every fixed list, `onDelete: Cascade` from Office downwards, `Restrict` where history matters (an order's document cannot be deleted).

## 3. How it is built

- **Separate Postgres schema `app`.** The new tables share the database with the current app's tables in `public` (several names overlap: `cases`, `tasks`, …). Keeping them apart lets the new model be migrated and tested without touching what the live site runs on.
- **Tenant safety in the database, not just in code.** Every office-owned table has `officeId`, and links between records use composite keys `(officeId, id)`, so a task, party or order physically cannot point at another office's case. Deleting an office cascades to its records only.
- **Rules enforced by indexes:** one live case per normalised number per office (archived cases may repeat), unique CNR per office, a document is stored once per office (`sha256`) and becomes at most one order, task de-duplication key, one primary client per case, one message draft per order per language, research versions numbered per report.
- **History is kept:** hearings are superseded rather than edited (`supersededById`), date changes are recorded, an order's document cannot be deleted while the order exists, audit rows are append-only.
- **Dates:** calendar dates are `DATE` columns (no time-zone drift); timestamps are `timestamptz`.
- **JSON only where it is a record of something proposed:** the AI/rules extraction and match on `ExtractionJob`, the snapshot on `CourtOrder`, and each research version's analysis. Everything the app filters or joins on is a real column.

Migrations: `20261022000000_init` (21 tables, 21 enums, indexes) and `20261022000100_seed_courts` (35 courts).

## 4. Switch-over plan (next step, not done yet)

1. Port the services in `src/lib/services/*` from the whole-office aggregate to Prisma repositories, keeping their tests.
2. On a Neon branch: `prisma migrate deploy`, seed the demo, run the full test suite and the browser walkthrough.
3. On production: `prisma migrate deploy`, re-seed the demo, deploy the ported app, verify `/api/health/ready`, then drop the old `public` tables (keeping `legal_judgments`, `schema_migrations`).
