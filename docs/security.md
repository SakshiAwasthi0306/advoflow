# Authentication and authorization

Applies when `AUTH_MODE=password`. With `AUTH_MODE=demo` (the public demo) there is no sign-in: everyone shares one fictional demo office.

## Mechanism and why

- **[Better Auth](https://better-auth.com) 1.7.7, self-hosted** on the app's PostgreSQL through its Prisma adapter (`src/lib/auth/better-auth.ts`). Chosen because it is a maintained library that works with Next.js App Router and Prisma, keeps sessions in our own database (so they can be revoked), and does not require sending client data to a third party. Neon's managed Better Auth was considered; it could not run inside CI tests, and nothing here needed its extra features.
- Only Better Auth's **server API** is used, from small routes we own. Its catch-all HTTP handler is **not mounted**, so no other auth endpoints (social sign-in, its own sign-up, …) exist.
- **Passwords:** Argon2id via `@node-rs/argon2`, OWASP baseline parameters (19 MiB memory, 2 iterations, 1 lane), 12–128 characters. Hashes live only in `Account.password` (provider `credential`); no plaintext is stored or logged, and no API returns a password, hash, token or session id.
- **Two-step login (mandatory):** after a correct password Better Auth issues **no session**, only a signed, HttpOnly challenge cookie valid for 10 minutes, and its two-factor plugin emails a 6-digit code (`otpOptions`: stored **hashed**, valid **5 minutes**, **5 wrong codes** end the attempt, single use; a resend invalidates the previous code). The session is created only by `POST /api/auth/verify`. Every account has `User.twoFactorEnabled = true` (schema default, set for older accounts by migration `20261022040000_two_factor`); if it were ever off, sign-in is refused rather than letting the code step be skipped. Registration ends in the same code step, which also proves the person controls the address. Authenticator apps (TOTP) and "trust this device" are not enabled.
- **Opting out:** `TWO_STEP_LOGIN=off` makes a whole deployment password-only (the plugin is not loaded; sign-in returns `{ status: "signed_in" }` and the session at once; Settings shows two-step login as "not live"; no email service needed). Everything else here still applies. Use it only where an emailed code is not workable; it is weaker: a leaked password alone is enough.
- **Code delivery** (`src/lib/email.ts`): Resend's HTTP API when `RESEND_API_KEY` and `EMAIL_FROM` are set. Without them, development writes the code to the server log (tagged with a hash of the address, never the address); production refuses to start a sign-in (`503`) and `/api/health` reports it, unless `EMAIL_DELIVERY=log` is set explicitly for automated tests. The sign-in screen says so when codes are going to the log.
- **Sessions:** a row in `app."Session"` per signed-in browser, **12 hours, fixed** (no sliding renewal, so the cookie and the row expire together; people sign in once a working day). Sign-out deletes the row, so a copied cookie stops working at once. Every request re-reads the user and membership from the database: a role change or deactivation (`User.isActive = false`) applies immediately.
- **Cookie:** `advoflow.session_token` (`__Secure-advoflow.session_token` in production), `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, `Max-Age` 12 h, value signed with `AUTH_SECRET`.

## Endpoints

| Method and path | Purpose | Responses |
|---|---|---|
| `POST /api/auth/login` `{ email, password }` | Step 1: password | `200 { status: "code_required", delivery: { channel: "email", to: "as•••@example.com", mode }, expiresInSeconds: 300 }` + **challenge cookie only** · `401` (one message for unknown email, wrong password, inactive or office-less account; no code is sent) · `400` · `429` (`Retry-After`) · `503` email not configured |
| `POST /api/auth/verify` `{ code }` | Step 2: emailed code | `200 { user, office: { id, name, role } }` + session cookie · `401` wrong/expired code or no challenge ("sign in again") · `400` not 6 digits · `429` |
| `POST /api/auth/resend-code` | New code for the current challenge | `200 { status: "code_sent" }` (old code stops working) · `401` no challenge · `429` (3 per 10 min) |
| `POST /api/auth/logout` | Sign out | `200 { ok: true }`; deletes the session and expires the cookie; harmless without a session |
| `GET /api/auth/me` | Current user | `200 { user: { id, email, name }, office: { id, name, role }, mode }` · `401` |
| `POST /api/auth/register` `{ name, email, password, officeName? }` | Self sign-up | **Closed by default** (`403`). With `ALLOW_REGISTRATION=true`: `201 { status: "code_required", … }` like login (finish with `/verify`); creates a new office with the person as owner · `400` invalid or already registered (same message) · `429` |
| `POST /api/auth/change-password` `{ currentPassword, newPassword }` | Change password | `200`; every **other** session is ended, this one continues · `400` wrong current password / weak / same as old · `429` |
| `POST /api/auth/forgot-password` `{ email }` | Email a reset link | Always the same `200` message, whether or not the address exists · `429` · `503` email not configured |
| `POST /api/auth/reset-password` `{ token, newPassword }` | Set a new password from the link | `200`; **all** sessions are ended · `400` invalid, expired (30 min) or already-used link |
| `POST /api/auth/sessions` `{ action: "sign_out_other_devices" }` | Sign out other devices | `200` |
| `GET /api/auth/verify-email?token=…` | Opened from an email link | Redirects to `/login?notice=…`; after an email change, ends every session of that account |
| `GET` / `PATCH /api/profile` | View / update own profile | `200` view (account, profile, photo url, security summary, completion) · `400` invalid or unknown field (`.strict()`: email, phone, verification flags, ids are refused) · `409` enrolment number already registered in that State Bar Council |
| `GET` / `POST` / `DELETE /api/profile/photo` | Own photo only (multipart `photo`) | JPEG/PNG/WebP detected from the bytes, ≤ 2 MB; served `private, no-store` with a sandbox CSP · `400` · `404` |
| `POST /api/profile/email` `{ newEmail, currentPassword }` | Start an email change | `200 { status: "verification_sent" }`; **nothing changes until the link sent to the new address is opened** · `400` wrong password · `409` address in use · `503` email not configured |
| `POST /api/profile/phone/send-code` `{ phoneNumber }` → `POST /api/profile/phone/verify` `{ phoneNumber, code }` | Add / change mobile | Saved only after the 6-digit SMS code is verified (5 min, 5 attempts); the old number stays until then · `409` number in use · `503` no SMS provider |
| `POST /api/profile/deletion-request` `{ currentPassword, confirmation: "DELETE MY ACCOUNT", reason? }` | Request account deletion | `200 { scheduledFor }` (+30 days); the account is deactivated and every session ended at once · `400` · `409` sole owner of an office others still use |
| `GET /api/judgments?q=…&limit=10` | Search the shared real-judgments corpus | `200 { results, attribution }` · `401` · `503` when no corpus is loaded |

All errors use `{ error, code, requestId }` (see README → Health checks).

## Account model and registration

AdvoFlow is a **multi-advocate** application: an **office** has members with roles (owner, advocate, clerk, viewer); all office data belongs to the office. Public registration is **off** unless `ALLOW_REGISTRATION=true`, because nothing in the requirements calls for strangers to create accounts. When it is on, each registrant gets a new, empty office of their own; joining an existing office is never self-service. Emails are trimmed and lower-cased and are unique in the database (`User.email @unique`).

### Creating the first account (safely)

```bash
# DATABASE_URL (and AUTH_MODE=password, AUTH_SECRET) set in .env.local or the environment; migrations applied (npm run db:migrate)
npm run create-user -- --email you@example.com --name "Your Name" --office-name "Your Chambers" --role owner
# Password: typed at a hidden prompt (or ADVOFLOW_PASSWORD=... for automation). Never passed as a command-line argument.

# Add a colleague to that office later (the office id is printed above):
npm run create-user -- --email clerk@example.com --name "Ravi" --office <officeId> --role clerk
```

## Advocate profile and account security

`/profile` (password mode only; the shared demo has no personal profile). Code: `src/lib/profile/*`, `src/app/api/profile/*`, `src/components/profile-forms.tsx`.

- **Own data only.** Every profile function takes the user id from the verified session, never from the request; there is no profile URL with an id in it, and no public profile. The photo is stored in the private document store under a per-user key and served only to its owner.
- **Validation.** Zod schemas with `.strict()`; unknown fields are refused, so email, mobile, verification flags or ids cannot be set by editing the request. Blank fields keep their saved value; only an explicit `null` ("Clear" in the UI) removes one. Enrolment numbers are unique per State Bar Council (partial unique index).
- **Completion** is a percentage of 10 items shown on the page; it never blocks access.
- **Email change** (Better Auth `changeEmail`, `updateEmailWithoutVerification: false`): needs the current password; a link (60 min) goes to the new address; the old address keeps working until it is opened; then every session ends and the person signs in with the new address. If the current address is already verified, it must approve the change first.
- **Mobile change** (Better Auth phone-number plugin): code to the new number; saved only after verification; duplicates refused.
- **Password change / reset** end other / all sessions. Reset links are single-use and valid 30 minutes; the forgot-password answer is identical for unknown addresses.
- **Deletion request**: password + typed phrase; the account is locked and signed out immediately; data is removed after 30 days (`AccountDeletionRequest`, handled by an administrator — no automatic purge job yet).
- Responses never contain passwords, hashes, codes, tokens or storage keys (checked by the e2e leak scan).

## Authorization (server side)

`src/lib/authz.ts`, used by every service and route:

1. **Who** — `src/lib/session.ts` is the only source of user, office and role; ids in the body, URL or query are never trusted for this.
2. **Which office** — services receive only the workspace of `session.officeId`, so other offices' records are not even loaded.
3. **Which record** — every lookup by id goes through `owned.case / client / hearing / order / task / document / clientUpdate / report / job`. Records belonging to a case also require their parent case to be in the same office. Another office's id and a non-existent id give the **same 404**, so ids cannot be probed.
4. **What** — `authorize(session, action)` with `read` (viewer+), `edit` (clerk+), `approve` (advocate+), `manage_office` (owner). Each service also checks its minimum role.
5. **Database** — composite `(officeId, id)` foreign keys make cross-office links impossible even if code were wrong.

The judgments corpus (`public.legal_judgments`) is shared reference data in a separate schema with no link to office records, read only through the connector and `GET /api/judgments`.

## Other protections

- **CSRF:** `SameSite=Lax` cookies, plus `src/middleware.ts` refuses any state-changing `/api` request a browser marks as cross-site (`Sec-Fetch-Site`, else `Origin` must match the host or `APP_URL`).
- **Rate limits** (shared by all server instances, stored in `app."RateLimit"` with hashed keys): sign-in 30 per address and 8 per email per 15 min; code checks 30 per address per 15 min (plus 5 per challenge); code resends 3 per address per 10 min; registration 5 per address per hour; judgments search 60 per user per minute.
- **Headers** (`next.config.mjs`): `Strict-Transport-Security` (2 years), `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`. Auth and error responses are `Cache-Control: no-store`; documents are served with a sandboxing CSP.
- **Logging:** sign-in events record user/office ids or short hashes only — never emails, names, passwords, cookies, tokens, case or order text (checked by a log scan during testing).
- **Misconfiguration fails closed:** password mode without a 32+ character `AUTH_SECRET` or without `DATABASE_URL` lets nobody in and is reported by `GET /api/health`; an unknown `AUTH_MODE` is treated as `password`.

## Production requirements

- Serve over **HTTPS only** (Vercel does). `NODE_ENV=production` makes cookies `Secure` and `__Secure-` prefixed; HSTS is sent on every response.
- Set `AUTH_MODE=password`, a unique random `AUTH_SECRET` (≥ 32 characters; rotating it signs everyone out), `DATABASE_URL`, `APP_URL` (the public `https://` address), and `RESEND_API_KEY` + `EMAIL_FROM` (a sender on a domain verified in Resend; without these nobody can finish signing in).
- Leave `ALLOW_REGISTRATION` unset unless you want public sign-up.

## Tests

`tests/security.e2e.test.ts` runs over real HTTP against a password-mode build and a throwaway database, reading sign-in codes from the server log (`EMAIL_DELIVERY=log`; CI does this on every push). Two-step login: password alone gives no session; wrong, malformed, expired-challenge and replayed codes fail; 5 wrong codes end the attempt; one person's code cannot finish another's sign-in; a resent code replaces the old one; deactivation between the steps is caught; codes never appear in a response. Also: unauthenticated access (401 / redirect), own records, cross-advocate read / edit / archive of cases, id-swapping on hearings, orders, tasks, documents, messages and research, forged office/user ids in bodies, invalid credentials and rate limiting, cookie attributes and CSRF, no secrets in any response, logout and deactivation ending sessions, and the judgments interface. `tests/profile.e2e.test.ts` (same setup, plus `SMS_DELIVERY=log`): unauthenticated access, own view/update and completion, blank-keeps/null-clears, refused protected fields and invalid values, duplicate enrolment, private photo and content-type checks, mobile verify/duplicate/old-number-kept, email change (wrong password, duplicate, unchanged until confirmed, tampered and reused links, sessions ended), password change and reset (sessions ended, single-use link), sign out other devices, deletion request, and a leak scan. Unit tests: `tests/profile.test.ts`, `tests/authz.test.ts`, Argon2id in `tests/core.test.ts`, account provisioning in `tests/prisma-store.test.ts`.

## Known gaps (not done in this step)

- No invitation emails. Password reset and email change work only once an email service (Resend) is configured.
- **No SMS provider**: mobile numbers cannot be verified in production until one is added (`src/lib/sms.ts`).
- Account deletion requests are recorded and the account is locked, but the final purge after 30 days is manual.
- Second factor is an **emailed code only**: no authenticator app (TOTP), SMS or passkeys yet, and no backup codes; someone who controls the advocate's email inbox and knows the password can sign in.
- **Email delivery is not live** until a Resend key and verified sender are added (development mode writes codes to the server log).
- A member of several offices always works in the oldest membership's office (no office switcher yet).
- Sessions are fixed at 12 h.
- The CSP does not restrict scripts (needs per-request nonces for Next.js).
- Account lockout is by rate limiting only.
- No legal or regulatory compliance assessment (e.g. India's DPDP Act, Bar Council rules) has been done; nothing here claims compliance.
