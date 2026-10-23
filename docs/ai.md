# AI court-order extraction

AdvoFlow reads an uploaded court order with an AI model and produces a **draft for an advocate to check**. Nothing
the AI proposes is saved to a case, hearing, order or task until an advocate confirms it, field by field.

## Provider and model

| Setting | Default | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | — | [OpenRouter](https://openrouter.ai/keys) key. Used when `GEMINI_API_KEY` is empty. |
| `OPENROUTER_MODEL` | `google/gemini-3.8-flash` | Any OpenRouter model that supports structured outputs. |
| `GEMINI_API_KEY` | — | Google AI Studio key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)); used directly through the official `@google/genai` SDK and takes precedence when set. |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Direct Gemini model id. |
| `AI_ZERO_DATA_RETENTION` | `true` | OpenRouter: route only to zero-data-retention endpoints. |
| `AI_TIMEOUT_MS` | `30000` | Per attempt. One retry for transient failures, never past the route's time limit. |
| `AI_MAX_OUTPUT_TOKENS` | `8192` | Per answer (16 384 for transcribing scans). |
| `AI_MAX_INPUT_CHARS` | `60000` | Characters of order text sent; the reviewer is warned if a document is longer. |
| `AI_USER_HOURLY_LIMIT` / `AI_OFFICE_DAILY_LIMIT` | `30` / `200` | AI calls per person per hour and per office per day. |
| `AI_IN_DEMO` | `false` | The shared public demo never calls the AI unless this is `true`. |

**Model choice (checked 2026-10-23).** `gemini-3.8-flash` is listed as the latest **stable** Flash model on Google's
[models page](https://ai.google.dev/gemini-api/docs/models) (inputs: text, image, PDF; 1,048,576 input / 65,536
output tokens; structured outputs supported). On OpenRouter the same model is `google/gemini-3.8-flash`
(`https://openrouter.ai/api/v1/models`: structured outputs, file and image input, $0.825 / $4.125 per million
input / output tokens; all endpoints are Google AI Studio or Google Vertex). Re-check both pages before changing it.

The keys are read only on the server (`src/lib/env.ts`), are never `NEXT_PUBLIC_`, never logged and never returned.
Without a key the app works as before (rule-based extractor) and the AI endpoint answers `503 AI_NOT_CONFIGURED`.

## Code

| Path | What |
|---|---|
| `src/lib/ai/client.ts` | The one entry point: provider choice, per-attempt timeout, bounded retry, usage logging |
| `src/lib/ai/openrouter.ts`, `src/lib/ai/gemini.ts` | One attempt each; error classification |
| `src/lib/ai/prompts/court-order.ts` | Versioned prompts (`court-order.extract.v1`, `court-order.transcribe.v1`) |
| `src/lib/ai/schemas/court-order.ts` | JSON Schema sent to the model + Zod schema that re-checks every answer |
| `src/lib/ai/services/court-order.ts` | Extraction, transcription of scans, and the **source checks** |
| `src/lib/ai/services/review.ts` | Differences against the case, confirmation, field-by-field review record |
| `src/lib/ai/limits.ts`, `src/lib/ai/errors.ts` | Usage limits; safe error messages |

## Endpoints

| Method and path | Who | Result |
|---|---|---|
| `POST /api/ai/extract-court-order` — JSON `{ text, caseNumber?, court? }` or multipart `{ file, caseNumber?, court? }` (PDF, JPG, PNG, text; ≤ 10 MB) | clerk+ | `201 { requestId, extraction }`: a **pending review** draft (`200 reused` for the same document again: no second AI call, no duplicate) · `400` · `401` · `429` usage limit · `503 AI_NOT_CONFIGURED` / `AI_UNAVAILABLE` · `504 AI_TIMEOUT` · `502 AI_INVALID_OUTPUT` · `422 AI_BLOCKED` / `AI_BAD_REQUEST` |
| `GET /api/ai/extractions/:id` | office members | The draft, its conflicts and `differences` against the matched case |
| `POST /api/ai/extractions/:id/confirm` — `{ confirm: true, input, acknowledgeDifferences? }` | advocate / owner | Writes only the approved (and edited) fields in one transaction · `409 { differences }` when a confirmed hearing date, the court or the CNR would change and was not acknowledged · confirming twice returns the first result |
| `POST /api/ai/extractions/:id/reject` | clerk+ | Draft discarded; no record changes |

The existing Upload → Review screens use the same service. Another office's id answers the same 404 as an unknown id.
Every response carries `x-request-id`; errors carry `requestId`, which is also in the server log.

## Not inventing legal information

The prompt tells the model to report only what the order states, keep order date / past hearings / next hearing /
compliance deadlines apart, return `null` with an explanation when unsure, quote exactly, and treat the document as
data (instructions inside it are ignored). **The application then checks the answer** (`draftFromOutput`):

- A "stated" value needs a quote that really occurs in the document; otherwise it is marked *not confirmed*.
- Case number, court, CNR, bench and party names must be written in the document; invented parties are removed.
- Every date must be a real date **written in its own quote**. A next hearing date also needs listing/adjournment
  wording, must come after the order date, and may not come from text that reads like an instruction to an AI;
  otherwise it is left blank. Deadlines without a written calendar date get no due date.
- A direction marked as the court's exact words must match the order text; otherwise it is shown as a summary.
  Directions in quotation marks are verbatim; others are summaries. The summary is always marked as a summary.
- Our checks can only lower the model's confidence. Every draft says it is unverified (`ai.verified: false`) and
  shows each value's source passage and page so the advocate can check the original.

## Data protection

- Only the one document (its text, or the scan itself for OCR) and the advocate's optional case-number / court
  hint are sent. No other cases, clients or office data. Prompts and document text are never written to logs: only
  task, model, timings, token counts and outcome codes (`ai.call`, `ai.call_failed`).
- OpenRouter requests set `provider.data_collection = "deny"`, `zdr = true` (unless `AI_ZERO_DATA_RETENTION=false`)
  and `require_parameters = true`; PDFs are read by the model itself (`file-parser` engine `native`), never by a
  separate OCR service. **Also check your OpenRouter account's privacy settings** (openrouter.ai → Settings →
  Privacy: keep prompt logging off and training providers disabled).
- An API key does not by itself make processing confidential. Before using real client documents, review
  OpenRouter's and Google's data-use, retention and regional-processing terms, and your obligations to clients
  (Bar Council rules, India's DPDP Act). This has not been assessed here.
- Model output is only ever parsed as JSON and validated; it is never executed, used in SQL, or given tools.

### Retention

- **Uploaded originals** are kept in private storage (Vercel Blob, or the local private folder) for as long as the
  office keeps them; they are never served by a public URL.
- **Drafts** (`ExtractionJob`, including the AI proposal and token usage) stay until the office is deleted; approved
  orders keep the proposal as `extractionSnapshot` and the review as `fieldReview` for audit. Rejected and failed
  drafts are kept with their document so they can be reopened. **There is no automatic expiry yet**; add one (for
  example: delete rejected/failed drafts after 90 days) before storing real client documents at scale.

## Setting the key on Vercel (advoflow-app, production)

Do this yourself; never paste a key into chat, a commit or a terminal command that is logged.

1. Vercel → project **advoflow-app** → Settings → Environment Variables → Add.
2. Key `OPENROUTER_API_KEY`, value: your OpenRouter key, **Environment: Production**, mark it **Sensitive**. Save.
3. (Optional) `OPENROUTER_MODEL` = `google/gemini-3.8-flash` (the default), Production.
4. Deployments → the latest production deployment → ⋯ → **Redeploy** (environment changes apply on the next deploy).
5. Check Settings in the app: "AI" should show the model "via OpenRouter (zero-data-retention routing)".

Do **not** add the key to the **advoflow** project (the public demo): it would not be used there anyway.

Locally: put `OPENROUTER_API_KEY=...` in `.env.local` (git-ignored) and run `npm run ai:smoke` for one real call
with a fictional order. It prints the extracted fields, checks and token usage, never the key.

## Tests

Mocked provider (no network, no key): `tests/ai-gemini.test.ts`, `tests/ai-openrouter.test.ts` (valid extraction,
missing fields stay null, invented or misplaced dates removed, invalid / cut-off / blocked output rejected, quota /
invalid key / timeouts / 5xx with bounded retries), `tests/ai-config.test.ts` (no key, demo mode),
`tests/ai-review.test.ts` (no writes before confirmation, only approved fields, field review record, roles, other
offices, confirmed dates protected). Over HTTP: `tests/ai.e2e.test.ts` (authentication, office isolation, explicit
confirmation, configuration error without a key, judgments table untouched).
