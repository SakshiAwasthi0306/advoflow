# AdvoFlow

**Court diary, order review and legal research for advocates in India — working prototype.**

Upload a court order. See what happened. Know what needs attention. Find what to research next. Keep the whole case organised.

AdvoFlow grew out of the single-page *Case Diary* prototype. It keeps that prototype's core loop (paste or upload an order → AI reads it → case history, hearing dates, tasks and English/Kannada client updates) and rebuilds it as a multi-page Next.js application with a server, a database layer, a human review step before anything is saved, and a Legal Research module.

**Live demo:** https://advoflow-phi.vercel.app (open demo office, fictional data — anyone with the link can edit it; do not upload real client documents).

**Coming from the Case Diary?** The original single-page prototype is kept unchanged in [`legacy/`](legacy/). [docs/case-diary-migration.md](docs/case-diary-migration.md) maps each of its features to AdvoFlow, lists what it could not do, and explains the decisions. Your old diary data can be brought in from **Settings → Import from Case Diary**.

> **Status: prototype.** It runs fully without any API keys in **demo mode**. Demo legal authorities are **fictional** and clearly labelled. Nothing in this repository is legal advice.

---

## What is live and what is mocked

| Area | Without configuration (demo mode) | With configuration |
|---|---|---|
| Order reading | Rule-based extractor for common English order phrasing and Kannada digits. Never guesses dates. **Not AI.** | Anthropic Claude (server-side), structured JSON validated with Zod, plus a check that every "stated" date appears in the order text |
| PDFs | Text layer read with `pdfjs-dist` | Same |
| Scans and photos (OCR) | Not available — use paste or manual entry | Claude vision OCR (English and Kannada). Accuracy on real Kannada orders has **not** been evaluated |
| Database | JSON files in `.data/` on the server (demo only, not secure) | PostgreSQL with relational schema and transactional saves |
| Sign-in | Single demo office, no login | Email + password (scrypt), HMAC-signed session cookie, roles |
| Legal research sources | Small corpus of **fictional** judgments | **Real judgments from eCourts open data** (Supreme Court headnotes + Karnataka HC, keyword search, loaded into PostgreSQL), or the Indian Kanoon API connector — **experimental, not tested end-to-end** |
| Statutory provisions | Fixed demo table of real CPC / Limitation Act references, marked *unverified* | AI-suggested, marked *unverified* (no official-text connector yet) |
| Calendar | CSV export (Google Calendar import format) | Same — **no live calendar sync** |
| Client messages | Drafts + copy + WhatsApp click-to-chat link | Same — **nothing is ever sent automatically; opening WhatsApp is not delivery** |
| Document storage | Local private folder, served only through an authenticated route | Replace with private object storage (see *Deployment*) |

The **Settings** page in the app shows this same live/not-live status for the running instance.

---

## Quick start (demo mode, no keys)

Requirements:

| Software | Version | Needed for |
|---|---|---|
| Node.js | 20.19+, 22.12+ or 24+ (CI uses 22) | everything (Prisma 7 sets this minimum) |
| npm | 10+ | installing |
| PostgreSQL | 14+ (Neon, local, or any host) | optional locally — demo mode uses files in `.data/`; required when hosted |
| Python | 3.9+ | only for loading the eCourts judgments (`scripts/judgments/`) |

```bash
npm install            # also generates the Prisma client (postinstall)
cp .env.example .env.local   # optional: everything works with no values set
npm run dev            # http://localhost:3000
curl -s localhost:3000/api/health    # {"status":"ok", ...}
```

Open the dashboard and click **Load demo workspace**. It creates three fictional cases (each tagged *Demo*):

- **O.S. 482/2025** — written-statement stage, three orders, a hearing date change that flags a task for review, overdue tasks, English and Kannada client drafts, and a research report (version 1) with supporting and contrary fictional authorities.
- **W.P. 12345/2024** — High Court writ with a hearing today and a pending order whose next date is relative ("list after two weeks"), so it waits for review with no date filled in.
- **O.S. 77/2023** — evidence stage with repeated adjournments.

Remove the demo data any time from **Settings → Remove demo data** (your own records stay).

### Demo walkthrough

1. **Dashboard** → today's hearing, overdue tasks, an order awaiting verification, a changed hearing date.
2. **My Cases → O.S. 482/2025 → Orders & Timeline** → three approved orders, the original documents, the date change.
3. **Upload Orders → Insert a sample order → Read orders → Review and confirm.**
4. On the review screen, check each field against the original, tick *I have checked this date*, choose the case, then **Review and confirm**.
5. The new case's timeline, the **Calendar** and **Tasks** update together.
6. Upload the same sample again — it is recognised as already approved; nothing is duplicated.
7. Open the W.P. order waiting for review and **Reject** it — confirmed records stay unchanged.
8. **Legal Research → open the report** → nine sections; every judgment is marked *Fictional — demo only*.
9. **Mark as reviewed**, **Save to case**, add a note, and **Make this a task…** (a dialog asks you to confirm before a task is created).
10. **Rerun research** → version 2; version 1 is kept unchanged.
11. Case → **Client Updates** → edit, copy, or open in WhatsApp.
12. **Calendar → Export CSV.** Refresh the page — everything persists.

---

## Health checks

| Endpoint | Meaning | Touches the database? | HTTP status |
|---|---|---|---|
| `GET /api/health` | **Liveness**: the app is running; is its configuration valid? | No | always `200`; body `status` is `ok` or `degraded` |
| `GET /api/health/ready` | **Readiness**: can it serve requests right now? | Yes — `SELECT 1` through Prisma, 3 s timeout | `200` `ready` or `503` `not_ready` |

Both are public (also in password mode), never cached, and contain no secrets: configuration problems are reported by variable **name**, database failures only as `timeout` or `connection_failed`. The full error goes to the server log with the same `requestId`.

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","service":"advoflow","version":"0.1.0","commit":null,"time":"…","uptimeSeconds":12,"checks":{"config":{"status":"ok"}}}

curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/health/ready
# with PostgreSQL:   {"status":"ready",…,"checks":{"config":{"status":"ok"},"database":{"status":"up","latencyMs":41}},"requestId":"…"}   HTTP 200
# demo, no database: {"status":"ready",…,"database":{"status":"not_configured","note":"DATABASE_URL not set: demo file store in use"}}   HTTP 200
# database down:     {"status":"not_ready",…,"database":{"status":"down","latencyMs":3001,"error":"timeout"}}   HTTP 503
```

A database is *required* for readiness when running on Vercel or when `RESEARCH_CONNECTOR=opendata`. No Anthropic key is needed for either endpoint.

**API errors** from every route share one shape: `{"error": "<message>", "code": "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "INTERNAL_ERROR", "requestId": "…"}` (also sent as the `x-request-id` header). Unexpected errors return a generic message; the details are only in the log.

**Logs** are JSON lines (`{"level":"error","time":"…","msg":"request failed","service":"advoflow","requestId":"…",…}`) on stdout/stderr. Fields named like passwords, tokens, keys or URLs, and any connection string inside a message, are masked. Set `LOG_LEVEL` to `debug`, `info` (default), `warn` or `error`.

## Configuration

Copy `.env.example` to `.env.local` and set only what you need. Every variable is validated at startup by `src/lib/env.ts`; problems are logged once (`configuration problems`) and shown in `GET /api/health` by name, never by value. An invalid value is ignored rather than half-used, and an unrecognised `AUTH_MODE` is treated as `password` so data is never exposed by a typo.

| Variable | Purpose |
|---|---|
| `APP_URL` | Public base URL of the app, e.g. `https://advoflow-phi.vercel.app` (optional; validated if set) |
| `AUTH_MODE` | `demo` (default) or `password` |
| `AUTH_SECRET` | Required in password mode. 32+ random characters (signs session cookies) |
| `ALLOW_REGISTRATION` | `true` opens `POST /api/auth/register` (password mode). Default closed |
| `RESEND_API_KEY`, `EMAIL_FROM` | Send two-step sign-in codes by email through Resend (password mode) |
| `TWO_STEP_LOGIN` | `required` (default): password, then an emailed code. `off`: password only (no email needed; weaker) |
| `EMAIL_DELIVERY` | `resend` or `log` (codes in the server log: development/tests only). Default: `resend` if a key is set, else `log` in development and none in production |
| `DATABASE_URL` | PostgreSQL URL. Empty = local file store |
| `DOCUMENT_STORAGE_DIR` | Private folder for uploads (default `.data/uploads`) |
| `BLOB_READ_WRITE_TOKEN` | Store uploads in a private Vercel Blob store instead of the local folder |
| `DATABASE_URL_UNPOOLED` | Direct (non-pooled) Postgres URL, used by `npm run db:migrate` (Prisma Migrate) when set (Neon) |
| `ANTHROPIC_API_KEY` | Enables AI extraction, OCR and research analysis |
| `ANTHROPIC_MODEL` | Claude model id (default `claude-sonnet-4-5`) |
| `RESEARCH_CONNECTOR` | `demo` (fictional corpus), `opendata` (real eCourts judgments in PostgreSQL), `indiankanoon`, or `none` |
| `INDIAN_KANOON_API_TOKEN` | Token for the Indian Kanoon connector |
| `LOG_LEVEL` | `debug`, `info` (default), `warn`, `error` |

API keys are read only on the server (`src/lib/config.ts` is `server-only`) and are never sent to the browser. An automated test fails if any client component references them.

### PostgreSQL and Prisma

```bash
# in .env.local (never commit it)
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require            # pooled, used by the app
DATABASE_URL_UNPOOLED=postgresql://USER:PASSWORD@HOST/DB?sslmode=require    # direct, used for migrations (optional)

npm run db:migrate                # prisma migrate deploy: applies prisma/migrations (creates schema "app" and public.legal_judgments)
npm run prisma:migrate:status     # which migrations are applied
curl -s localhost:3000/api/health/ready   # confirms the app reaches the database through Prisma
```

**How data is stored** — in plain terms:

- **All app data lives in the normalised tables of Postgres schema `app`**, defined in `prisma/schema.prisma` (explained in [docs/data-model.md](docs/data-model.md)) and created by Prisma Migrate. The app reads and writes them through Prisma (`src/lib/store/prisma-store.ts`).
- **The app's business logic still works on one office at a time** (load the office → change it → save). The Prisma store assembles that office from the tables and, on save, writes **only the rows that changed**, in one transaction, after a version check (two people saving at once cannot overwrite each other; the second save is re-applied to fresh data).
- **The database enforces the important rules itself**: records cannot point at another office's records, one live case per case number, one order per document, no duplicate tasks, one primary client per case, hearing history kept.
- **Shared judgments** (`public.legal_judgments`) are reference data outside the Prisma models (full-text column), created by a migration and filled by `scripts/judgments/`.
- Prisma's own history table lives in `app` (`prisma.config.ts` adds `schema=app` for the CLI). Prisma talks to Postgres through `node-postgres` (the Prisma `pg` adapter); the generated client (`src/generated/prisma/`) is not committed and `npm install` regenerates it.
- Schema changes: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` against a local database or a Neon **branch**, review the SQL, commit it. Never run `prisma db push` or `prisma migrate reset` against a database with real data.
- Without `DATABASE_URL` the app uses the local demo file store in `.data/` instead (not for real data).
### Sign-in, accounts and roles

`AUTH_MODE=password` turns on **two-step sign-in**: email + password, then a 6-digit code sent by email (Better Auth, Argon2id, database sessions, HttpOnly cookies). It needs `AUTH_SECRET` (32+ random characters), `DATABASE_URL`, and — to email the codes — `RESEND_API_KEY` + `EMAIL_FROM` (without them, codes go to the server log in development only). Registration is **closed** unless `ALLOW_REGISTRATION=true`; create accounts with:

```bash
npm run create-user -- --email you@example.com --name "Your Name" --office-name "Your Chambers" --role owner   # password typed at a hidden prompt
```

Roles: **owner** (everything, demo data, export), **advocate** (approves orders and research), **clerk** (uploads, tasks, clients), **viewer** (read-only). Every request is checked on the server: the office comes only from the session, another office's record answers 404, and roles are enforced per action. Endpoints (`/api/auth/login`, `/logout`, `/me`, `/register`), the authorization pattern, CSRF, rate limits, production requirements and known gaps: **[docs/security.md](docs/security.md)**.

### AI (Anthropic Claude)

Set `ANTHROPIC_API_KEY`. Uploaded order text is then sent to Anthropic for extraction, and scans and photos for OCR. **Tell your users, and check your client-confidentiality obligations, before enabling this.** Order text is wrapped as untrusted data in prompts; the model is told never to follow instructions inside it.

### OCR

Text-based PDFs (for example, downloaded eCourts orders) are read locally without OCR. Scans and photos use Claude vision when a key is set. To use a dedicated OCR service (for example Google Cloud Vision, which supports Kannada), implement it in `src/lib/extraction/text.ts` → `extractText()`; the rest of the pipeline is unchanged. Evaluate accuracy on real Kannada orders before relying on it.

### Legal research connectors

All sources implement one interface (`src/lib/research/connectors.ts`):

```ts
interface ResearchConnector {
  id: string; label: string;
  live: boolean;       // real external source
  fictional: boolean;  // demo corpus
  available(): Promise<{ ok: boolean; reason?: string }>;
  search(query: string, limit: number): Promise<RetrievedDoc[]>;
  get(sourceId: string): Promise<RetrievedDoc | null>;
}
```

The research pipeline (`src/lib/research/pipeline.ts`):

1. Uses only **advocate-approved** orders (plus any documents you select) as context.
2. **Demo mode:** fixed issue rules + fictional corpus. **AI mode:** Claude identifies issues, separating facts stated in orders from inferences, and proposes search queries and provisions (marked AI-suggested, unverified).
3. Retrieves judgments from the configured connector.
4. Claude analyses **only the retrieved sources**, referring to them by id. Case name, citation, court, date and URL always come from the source record, never from the model. Any reference that doesn't match a retrieved source is dropped and reported in *Limitations*.
5. Saves the result as a **new version**; earlier versions are never overwritten.

Every report shows its mode (demo / AI without live source / live), the orders it used, the queries run, result counts, errors and limitations. Subsequent-treatment (good-law) checking is **not** implemented and the UI says so.

To add a licensed source, implement the interface and return it from `getConnector()`.

#### eCourts open data (real judgments, free)

`RESEARCH_CONNECTOR=opendata` searches real judgments stored in the `legal_judgments` table (created by `prisma/migrations/20261022010100_legal_judgments`). They come from the public datasets [indian-supreme-court-judgments](https://registry.opendata.aws/indian-supreme-court-judgments/) and [indian-high-court-judgments](https://registry.opendata.aws/indian-high-court-judgments/), published by Dattam Labs from eCourts under **CC-BY-4.0** (attribution is shown on every report that uses them).

| Court | What is stored and searched | Default range |
|---|---|---|
| Supreme Court of India | Parties, SCR and neutral citation, author judge, date, and the **Issue for Consideration + headnotes** read from the first pages of each reported judgment PDF | 2010 → current year |
| High Court of Karnataka | Parties, neutral citation, CNR, seat and judges, date, outcome, case type and the **opening lines** from eCourts metadata (the PDF is linked, not read) | 2026 (decided matters; non-prosecution, dropped and abated matters left out) |

Load or extend it (Python 3.9+, runs from a laptop; re-running is safe):

```bash
python3 -m venv .venv-judgments && .venv-judgments/bin/pip install -r scripts/judgments/requirements.txt
npm run db:migrate
DATABASE_URL_UNPOOLED=postgres://... .venv-judgments/bin/python scripts/judgments/load_judgments.py --sc-from 2010 --khc-from 2026
```

Search is PostgreSQL full-text search: a record is returned only when at least two terms of the query appear in it. Without an AI key, reports list these judgments as **"Not analysed"** with the matched terms; no stance, principle or argument is generated for them. With an AI key, Claude analyses the stored headnotes/opening lines only. Mind your database plan's storage: the default load (13,015 Supreme Court + 54,427 Karnataka HC records) takes about 180 MB.

---

## Architecture

```
Browser (React, Next.js App Router)
  │  server components read data; client components call /api routes
  ▼
API routes (src/app/api/*) ── route() wrapper: Zod validation, safe errors, rate limits
  │  session from signed cookie → officeId + role (never from the request body)
  ▼
Services (src/lib/services/*) ── pure business logic on one office "Workspace"
  │  orders.ts: match → review job → approve/reject → hearings, tasks, drafts
  │  cases.ts, research.ts, queries.ts (dashboard, calendar, reports)
  ▼
WorkspaceStore (src/lib/store/*)
  ├─ FileStore     (.data/, demo/dev; atomic writes, version check)
  └─ PrismaStore   (PostgreSQL schema "app" via Prisma; changed rows only, one transaction per save, optimistic locking)

Extraction: text.ts (sniff bytes → PDF text / OCR) → demo-extractor.ts | ai-extractor.ts
Research:   pipeline.ts → connectors.ts (demo corpus | Indian Kanoon) → services/research.ts
```

**Consistency model.** Each request loads the office's aggregate, applies a change, and saves it as one unit with a version check; on conflict the change is re-applied to fresh data (up to three times). Approving an order therefore adds the order, updates the case stage, creates or supersedes hearings, records date changes, creates approved tasks and drafts client messages **together or not at all**. In PostgreSQL this is a single transaction.

**Idempotency.** Each upload is keyed by the SHA-256 of its content; re-uploading returns the existing review item. Approving twice returns the first result. Approved tasks carry a de-duplication key (document + task), backed by a unique index in PostgreSQL. A document can become only one approved order (unique index).

**Data model** (`src/lib/types.ts` in the app, `prisma/schema.prisma` in the database — see [docs/data-model.md](docs/data-model.md)): offices, users, office memberships, clients, cases, documents, processing jobs, court orders, hearings, date changes, tasks, client updates, research reports, research report versions, legal issues, statutory provisions, judicial authorities, source passages, saved authorities, research notes, audit logs. The model keeps these separate:

- original document ↔ AI extraction (kept on the job and as `extractionSnapshot`) ↔ advocate-approved order (only ticked fields)
- proposed hearing (`awaiting_verification`) ↔ confirmed ↔ superseded / held / cancelled (history is never deleted)
- research suggestion ↔ advocate-confirmed task

**Hearing changes.** When an approved order moves a hearing that hasn't happened yet, the old hearing becomes *superseded*, a date change is recorded, and open tasks due on the old date are **flagged**, not moved. You choose *Move* or *Keep* for each task. Completed tasks are never touched.

### Project layout

```
src/app/              pages (dashboard, cases, upload, review, calendar, tasks, research, clients, reports, settings, login) and /api routes
src/components/        design system (ui.tsx, status.tsx), shell, forms and interactive widgets
src/lib/               types, schemas, dates, auth, config, storage
src/lib/env.ts         environment validation (names only in errors)
src/lib/logger.ts      structured JSON logging with secret masking
src/lib/http.ts        API error format and request ids
src/lib/health.ts      liveness / readiness logic; routes in src/app/api/health/
src/lib/db/prisma.ts   Prisma Client (pg adapter); prisma/schema.prisma, prisma.config.ts
src/lib/services/      business logic
src/lib/extraction/    text extraction, demo and AI extractors
src/lib/research/      connectors, demo corpus (fictional), demo rules, pipeline
src/lib/store/         FileStore, PrismaStore
prisma/                Prisma schema and migrations
scripts/               migrate, create-user
tests/                 unit + PostgreSQL tests; tests/e2e browser walkthrough
```

---

## Testing

```bash
npm run typecheck
npm run lint
npm test                    # unit and integration tests (vitest), incl. env validation, logging, error format, health checks and authorization
PG_TEST_URL=postgres://postgres@localhost:5432/advoflow_test npm test   # also applies the Prisma migrations to that THROWAWAY database, checks the schema rules and runs the Prisma store tests
```

The tests cover: Indian date parsing; case-number normalisation; extraction of stated fields with source passages; **missing and relative dates are never invented**; a party's request is not treated as a court direction; approval updates case, hearing, tasks and drafts together; **idempotent re-upload and re-approval**; **rejecting leaves records unchanged**; **ambiguous case matches are not merged**; duplicate case blocking; **date changes keep history, flag open tasks and never touch completed ones**; unconfirmed hearings stay out of confirmed calendar entries; role checks; demo data is labelled fictional; research reports identify their source orders; **research versions are preserved**; **research tasks need confirmation**; **office isolation** (file store and PostgreSQL); concurrent writes; PostgreSQL rollback on stale writes and the duplicate-case constraint; signed sessions and password hashing; WhatsApp link encoding; **no client component references server secrets**.

Browser walkthrough (requires Playwright and a running app):

```bash
npm run build && npm start &
npx playwright install chromium
BASE_URL=http://localhost:3000 node tests/e2e/demo-workflow.mjs
```

It follows the 16-step demo workflow above and checks mobile layout.

---

## Security and privacy

Implemented:

- Server-side authentication (password mode), HMAC-signed `httpOnly` session cookies, scrypt password hashing.
- Role-based permissions checked in every service function.
- Office isolation: every read and write is scoped to the office from the verified session. Tested for both stores, and live-tested over HTTP: another office's documents, cases and tasks return 404.
- Uploads: 15 MB limit, file type detected from the bytes (not the name), originals stored outside the web root and served only after an office check, with `Content-Security-Policy: sandbox`.
- Zod validation on every API input; error responses never include stack traces or document contents; server logs record error names only.
- Rate limits on order processing, research and login (in-memory, per instance).
- Append-only audit log of every change.
- Owner-only data export (Settings).
- Security headers (`nosniff`, `frame-ancestors` via `X-Frame-Options: DENY`, referrer policy).

You must add or arrange before using real client data:

- HTTPS in front of the app (encryption in transit) and encryption at rest for the database and document storage (managed PostgreSQL and object storage usually provide this).
- Private object storage with expiring signed URLs instead of the local folder.
- A shared rate-limit store (for example Redis) if you run several instances.
- Backups: scheduled `pg_dump` plus object-storage versioning; test restores.
- A deletion process (the export exists; deletion of an office's data is not built yet).
- Malware scanning of uploads if your threat model requires it.
- A data-processing agreement and client disclosure before enabling the AI integration.

No compliance certification is claimed.

---

## Deployment

**Demo or pilot on one server** (Node 20+): `npm ci && npm run build && npm start` behind a reverse proxy with HTTPS. Persist `.data/` on disk, or better, use PostgreSQL.

**Vercel** (how the live demo runs): Neon Postgres + private Vercel Blob. The Vercel project is connected to this repository, so every push to `main` deploys to production automatically (other branches get preview deployments).

- `DATABASE_URL` = Neon **pooled** connection string; `DATABASE_URL_UNPOOLED` = the **direct** one (used for migrations). `neon init` / `neon deploy` write both to `.env.local`; add them to the Vercel project as sensitive variables.
- Create a **private** Blob store and connect it to the project; that sets `BLOB_READ_WRITE_TOKEN`, and uploads go to Blob (`BlobDocumentStorage` in `src/lib/storage.ts`).
- Build command: `npm run db:migrate && next build`: each deploy first applies pending Prisma migrations (and fails without a database), so a deploy never runs against an older schema.
- `AUTH_MODE=demo` gives an open demo; use `AUTH_MODE=password` with `AUTH_SECRET` for anything real.
- The pg pool is registered with `attachDatabasePool` from `@vercel/functions` so idle connections close cleanly on Fluid compute.
- Keep the Vercel function region next to the database (the demo uses `sin1` with Neon in `ap-southeast-1`).

---

## Setup steps that need you

- **Your own `.env.local`**: copy `.env.example`; fill `DATABASE_URL` (and `DATABASE_URL_UNPOOLED`) if you want PostgreSQL locally. The hosted demo's values live in Vercel → Project → Settings → Environment Variables; `vercel env pull .env.local` copies them if you need them on another machine.
- **`APP_URL`** is not set on Vercel yet; add it (e.g. `https://advoflow-phi.vercel.app`) when something needs absolute links.
- **Rotate the Neon database password** (Neon → Roles → Reset password) because it was shared in a chat during setup, then update `DATABASE_URL` / `DATABASE_URL_UNPOOLED` in Vercel and `.env.local`.
- **`ANTHROPIC_API_KEY`** and **`INDIAN_KANOON_API_TOKEN`** are optional and not set; the app runs without them.

## Known limitations

- The demo extractor only understands common English order phrasing. Kannada-language orders need the AI path, whose accuracy on real orders has not been measured.
- The Indian Kanoon connector is written against public API docs but **has not been run against the live API**. No official legislation connector exists, so all provisions are unverified.
- No subsequent-treatment (good-law) checking.
- Kannada client drafts are template-based (demo) or AI-written. Have a Kannada speaker check them.
- No automatic eCourts sync (by design for this prototype; eCourts uses CAPTCHA).
- Rate limiting and the per-office write lock are in-memory (single instance).
- The workspace-aggregate save model is simple and safe, but writes the whole office per change. Move to per-entity repositories before offices reach thousands of cases.
- Notifications are in-app only (no email, SMS or push).
- Team assignment of tasks is modelled (`assigneeId`) but not exposed in the UI yet.

---

## Publishing to GitHub

Source: https://github.com/SakshiAwasthi0306/advoflow. To publish your own copy:

```bash
cd advoflow
git init -b main            # skip if .git already exists
git add -A
git commit -m "AdvoFlow prototype"
# create an empty repository on github.com (no README), then:
git remote add origin https://github.com/<you>/advoflow.git
git push -u origin main
```

`.gitignore` excludes `.env*` (except `.env.example`), `.data/` (local database and uploads) and build output, so credentials, client records and uploaded orders are not committed.

The GitHub Actions workflow in `.github/workflows/ci.yml` runs type checking, linting, unit tests and PostgreSQL tests (against a service container), plus a production build, on every push and pull request.
