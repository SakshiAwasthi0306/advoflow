# Case Diary → AdvoFlow

The original prototype is kept unchanged in [`legacy/Case Diary – auto-updating court diary.html`](../legacy/) (byte-identical copy; SHA-256 `22cd1e3e…d7e`). This note records what it did, what it could not do, where each feature lives now, and the decisions taken.

## What the Case Diary did

One 200-line HTML file (inline CSS + vanilla JS), meant to run inside claude.ai.

| Capability | How |
|---|---|
| Add orders | Paste text (English/Kannada), attach photos or `.txt`; optional case number and court hints; "Try a sample order" |
| AI reading | `claude.use("sample").json(prompt)` — case number, parties, court, order date, next date, stage, summary, adjourned, costs, tasks, English + Kannada client update; told not to invent dates and to mention the Nth adjournment |
| Case history | Cases keyed by a normalised number; each order appended as a hearing with the original text kept (≤3,000 chars) |
| Date changes | If a new order moved an upcoming date, recorded `changed: {from, to}` and **silently moved** open tasks due on the old date |
| Verification | Every entry starts "unverified"; *Verify* shows the original text, lets you correct the next date and *Confirm* |
| Needs attention | Overdue / due within 3 days, hearing tomorrow, date changed |
| To-do list | All tasks across cases, checkbox to complete, sorted by due date, "high" tag |
| Upcoming hearings | Table sorted by next date with due tags |
| Adjournments | Count per case; red at 3 or more |
| Client updates | Latest English + Kannada draft per case, Copy, open WhatsApp (`wa.me`) |
| Calendar | CSV in Google Calendar import format (hearings + task deadlines) |
| Time saved | "N orders read · about N×10 minutes of manual diary work saved" |
| Theme | Light/dark following the system setting, mobile-safe layout |
| Clear all data | One confirm, wipes localStorage |

## Limitations it had

- **Data lived only in one browser's `localStorage`** (`case-diary-v1`): no backup, no sharing, lost if site data is cleared; no office or user separation.
- **AI output went straight into the diary** — no review step before records changed; "verify" was optional and after the fact.
- **Tasks were moved automatically** when a date changed; an earlier date could disappear from view.
- Only worked inside claude.ai (AI and downloads were host-provided); images were not stored, only "(image: …)" placeholders.
- No PDFs (eCourts orders are usually PDFs), no clients, no roles, no audit trail, no legal research, no reports.
- Everything (history, tasks, drafts) in one JSON blob — re-reading the same order created a duplicate entry.

## Where each feature lives in AdvoFlow

| Case Diary | AdvoFlow |
|---|---|
| Add today's orders, sample order | **Upload Orders** (text, PDF text layer, photos/scans with an AI key, `.txt`, up to 20 files) |
| AI reading | `src/lib/extraction/` — Claude with Zod-validated JSON when `ANTHROPIC_API_KEY` is set, otherwise a rule-based extractor that never guesses dates |
| Unverified → Verify → Confirm date | **Review and confirm** *before* anything is saved; per-field ticks with source passages; unconfirmed hearings stay "awaiting verification" |
| Case history with original text | Case → **Orders & Timeline** and **Documents** (original files kept in private storage) |
| Date changed, tasks moved | Old hearing kept as *superseded*, date change recorded, affected tasks **flagged** with Move / Keep |
| Needs attention | Dashboard + bell: overdue, due today, awaiting review, unconfirmed dates, moved hearings, **hearing tomorrow** |
| To-do list | **Tasks** page and case Tasks tab |
| Upcoming hearings | Dashboard "Next 7 days", **Calendar** (month / week / agenda) |
| Adjournment count | Dashboard "Repeated adjournments" (3+), Reports |
| Client updates EN/KN, Copy, WhatsApp | Case → **Client Updates** (editable drafts, copy, WhatsApp hand-off; never auto-sent) |
| Calendar CSV | Calendar → **Export CSV** (same Google Calendar columns; unconfirmed dates labelled) |
| Time saved | Dashboard subtitle (non-demo orders only, labelled as an estimate) |
| Dark mode | Theme tokens in `globals.css`, follows the system setting |
| Clear all data | Not carried over as one button: Settings → *Remove demo data* and *Export office data*; deleting a real office's data needs a deliberate process |
| **Existing diary data** | Settings → **Import from Case Diary** (below) |

## Importing old diary data

`src/lib/services/diary-import.ts`, `POST /api/import/case-diary`, Settings card.

1. Open the old Case Diary page in the browser where it was used.
2. In the console run `copy(localStorage.getItem("case-diary-v1"))`.
3. Paste into Settings → *Import from Case Diary* (or choose a saved `.json`).

Each diary entry becomes a stored document plus an approved order through the normal approval path, so hearings, superseded dates, date changes and client drafts behave like uploaded orders. Next dates that were not verified in the diary arrive as *awaiting verification*. The diary's own last English/Kannada messages replace the template drafts. Matching uses the normalised case number (so "OS 482 of 2025" finds "O.S. 482/2025"). Re-importing the same data adds nothing. Advocate or owner only. Covered by `tests/diary-import.test.ts`.

## Decisions

- **Keep the existing stack** (Next.js 14 App Router, React, TypeScript, Tailwind, PostgreSQL) — as required.
- **Keep `pg` with SQL migrations instead of switching to Prisma.** The store saves a whole office aggregate in one transaction with optimistic locking, has partial unique indexes Prisma cannot express in its schema (e.g. one live case per normalised number), and is covered by tests and running in production on Neon. Rewriting it to Prisma would add risk without adding a capability. Revisit if the data model moves to per-entity repositories (see README → Known limitations).
- **Do not auto-move tasks** on a date change (the diary did); the advocate chooses per task.
- **No "clear everything" button** for real data.

## Plan

| Phase | Scope | Status |
|---|---|---|
| 1 | Inspect diary; migrate data and lost features (import, dark mode, time-saved, hearing tomorrow) | Done (this change) |
| 2 | Evaluate AI extraction on real Karnataka orders (English + Kannada) with an Anthropic key; per-field accuracy log | Needs `ANTHROPIC_API_KEY` |
| 3 | Password mode as default for anything real; invite flow; office data deletion | Planned |
| 4 | Verified legal sources: live Indian Kanoon connector test, official statute text connector | Needs `INDIAN_KANOON_API_TOKEN` |
| 5 | Notifications (email/WhatsApp Business) for "hearing tomorrow" and overdue tasks | Planned |
