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

Requirements: Node.js 20 or 22, npm.

```bash
npm install
npm run dev            # http://localhost:3000
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

## Configuration

Copy `.env.example` to `.env.local` and set only what you need:

| Variable | Purpose |
|---|---|
| `AUTH_MODE` | `demo` (default) or `password` |
| `AUTH_SECRET` | Required in password mode. 32+ random characters |
| `DATABASE_URL` | PostgreSQL URL. Empty = local file store |
| `DOCUMENT_STORAGE_DIR` | Private folder for uploads (default `.data/uploads`) |
| `BLOB_READ_WRITE_TOKEN` | Store uploads in a private Vercel Blob store instead of the local folder |
| `DATABASE_URL_UNPOOLED` | Direct (non-pooled) Postgres URL, used by `npm run db:migrate` when set (Neon) |
| `ANTHROPIC_API_KEY` | Enables AI extraction, OCR and research analysis |
| `ANTHROPIC_MODEL` | Claude model id (default `claude-sonnet-4-5`) |
| `RESEARCH_CONNECTOR` | `demo` (fictional corpus), `opendata` (real eCourts judgments in PostgreSQL), `indiankanoon`, or `none` |
| `INDIAN_KANOON_API_TOKEN` | Token for the Indian Kanoon connector |

API keys are read only on the server (`src/lib/config.ts` is `server-only`) and are never sent to the browser. An automated test fails if any client component references them.

### PostgreSQL

```bash
export DATABASE_URL=postgres://user:pass@host:5432/advoflow
npm run db:migrate                     # applies db/migrations/*.sql once each
```

### Password mode and users

```bash
export AUTH_MODE=password AUTH_SECRET="$(openssl rand -base64 48)"
npm run create-user -- --email asha@example.com --name "Asha Rao" --password 'a-long-password' \
  --office office_rao --office-name "Rao Chambers" --role owner
```

Roles: **owner** (everything, demo data, export), **advocate** (approves orders and research), **clerk** (uploads, tasks, clients), **viewer** (read-only). Permissions are checked on the server for every change.

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

`RESEARCH_CONNECTOR=opendata` searches real judgments stored in the `legal_judgments` table (`db/migrations/002_legal_judgments.sql`). They come from the public datasets [indian-supreme-court-judgments](https://registry.opendata.aws/indian-supreme-court-judgments/) and [indian-high-court-judgments](https://registry.opendata.aws/indian-high-court-judgments/), published by Dattam Labs from eCourts under **CC-BY-4.0** (attribution is shown on every report that uses them).

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
  └─ PostgresStore (relational tables, one transaction per save, optimistic locking)

Extraction: text.ts (sniff bytes → PDF text / OCR) → demo-extractor.ts | ai-extractor.ts
Research:   pipeline.ts → connectors.ts (demo corpus | Indian Kanoon) → services/research.ts
```

**Consistency model.** Each request loads the office's aggregate, applies a change, and saves it as one unit with a version check; on conflict the change is re-applied to fresh data (up to three times). Approving an order therefore adds the order, updates the case stage, creates or supersedes hearings, records date changes, creates approved tasks and drafts client messages **together or not at all**. In PostgreSQL this is a single transaction.

**Idempotency.** Each upload is keyed by the SHA-256 of its content; re-uploading returns the existing review item. Approving twice returns the first result. Approved tasks carry a de-duplication key (document + task), backed by a unique index in PostgreSQL. A document can become only one approved order (unique index).

**Data model** (`src/lib/types.ts`, `db/migrations/001_init.sql`): offices, users, office memberships, clients, cases, documents, processing jobs, court orders, hearings, date changes, tasks, client updates, research reports, research report versions, legal issues, statutory provisions, judicial authorities, source passages, saved authorities, research notes, audit logs. The model keeps these separate:

- original document ↔ AI extraction (kept on the job and as `extractionSnapshot`) ↔ advocate-approved order (only ticked fields)
- proposed hearing (`awaiting_verification`) ↔ confirmed ↔ superseded / held / cancelled (history is never deleted)
- research suggestion ↔ advocate-confirmed task

**Hearing changes.** When an approved order moves a hearing that hasn't happened yet, the old hearing becomes *superseded*, a date change is recorded, and open tasks due on the old date are **flagged**, not moved. You choose *Move* or *Keep* for each task. Completed tasks are never touched.

### Project layout

```
src/app/              pages (dashboard, cases, upload, review, calendar, tasks, research, clients, reports, settings, login) and /api routes
src/components/        design system (ui.tsx, status.tsx), shell, forms and interactive widgets
src/lib/               types, schemas, dates, auth, config, storage
src/lib/services/      business logic
src/lib/extraction/    text extraction, demo and AI extractors
src/lib/research/      connectors, demo corpus (fictional), demo rules, pipeline
src/lib/store/         FileStore, PostgresStore
db/migrations/         SQL schema
scripts/               migrate, create-user
tests/                 unit + PostgreSQL tests; tests/e2e browser walkthrough
```

---

## Testing

```bash
npm run typecheck
npm run lint
npm test                    # unit and integration tests (vitest)
PG_TEST_URL=postgres://postgres@localhost:5432/advoflow_test npm test   # also runs PostgreSQL store tests (uses an EMPTY throwaway DB)
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
- Build command: `npm run db:migrate && next build`, so each deploy applies pending migrations (and fails without a database).
- `AUTH_MODE=demo` gives an open demo; use `AUTH_MODE=password` with `AUTH_SECRET` for anything real.
- The pg pool is registered with `attachDatabasePool` from `@vercel/functions` so idle connections close cleanly on Fluid compute.
- Keep the Vercel function region next to the database (the demo uses `sin1` with Neon in `ap-southeast-1`).

---

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
