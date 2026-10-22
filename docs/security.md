# Authentication and authorization

Applies when `AUTH_MODE=password`. With `AUTH_MODE=demo` (the public demo) there is no sign-in: everyone shares one fictional demo office.

## Mechanism and why

- **[Better Auth](https://better-auth.com) 1.7.7, self-hosted** on the app's PostgreSQL through its Prisma adapter (`src/lib/auth/better-auth.ts`). Chosen because it is a maintained library that works with Next.js App Router and Prisma, keeps sessions in our own database (so they can be revoked), and does not require sending client data to a third party. Neon's managed Better Auth was considered; it could not run inside CI tests, and nothing here needed its extra features.
- Only Better Auth's **server API** is used, from four small routes we own. Its catch-all HTTP handler is **not mounted**, so no other auth endpoints (social sign-in, its own sign-up, password reset, …) exist.
- **Passwords:** Argon2id via `@node-rs/argon2`, OWASP baseline parameters (19 MiB memory, 2 iterations, 1 lane), 12–128 characters. Hashes live only in `Account.password` (provider `credential`); no plaintext is stored or logged, and no API returns a password, hash, token or session id.
- **Sessions:** a row in `app."Session"` per signed-in browser, **12 hours, fixed** (no sliding renewal, so the cookie and the row expire together; people sign in once a working day). Sign-out deletes the row, so a copied cookie stops working at once. Every request re-reads the user and membership from the database: a role change or deactivation (`User.isActive = false`) applies immediately.
- **Cookie:** `advoflow.session_token` (`__Secure-advoflow.session_token` in production), `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, `Max-Age` 12 h, value signed with `AUTH_SECRET`.

## Endpoints

| Method and path | Purpose | Responses |
|---|---|---|
| `POST /api/auth/login` `{ email, password }` | Sign in | `200 { user, office: { id, name, role } }` + cookie · `401` (one message for unknown email, wrong password, inactive or office-less account) · `400` invalid input · `429` too many attempts (`Retry-After`) |
| `POST /api/auth/logout` | Sign out | `200 { ok: true }`; deletes the session and expires the cookie; harmless without a session |
| `GET /api/auth/me` | Current user | `200 { user: { id, email, name }, office: { id, name, role }, mode }` · `401` |
| `POST /api/auth/register` `{ name, email, password, officeName? }` | Self sign-up | **Closed by default** (`403`). With `ALLOW_REGISTRATION=true`: `201` + cookie; creates a new office with the person as owner · `400` invalid or already registered (same message) · `429` |
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
- **Rate limits** (shared by all server instances, stored in `app."RateLimit"` with hashed keys): sign-in 30 per address and 8 per email per 15 min; registration 5 per address per hour; judgments search 60 per user per minute.
- **Headers** (`next.config.mjs`): `Strict-Transport-Security` (2 years), `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`. Auth and error responses are `Cache-Control: no-store`; documents are served with a sandboxing CSP.
- **Logging:** sign-in events record user/office ids or short hashes only — never emails, names, passwords, cookies, tokens, case or order text (checked by a log scan during testing).
- **Misconfiguration fails closed:** password mode without a 32+ character `AUTH_SECRET` or without `DATABASE_URL` lets nobody in and is reported by `GET /api/health`; an unknown `AUTH_MODE` is treated as `password`.

## Production requirements

- Serve over **HTTPS only** (Vercel does). `NODE_ENV=production` makes cookies `Secure` and `__Secure-` prefixed; HSTS is sent on every response.
- Set `AUTH_MODE=password`, a unique random `AUTH_SECRET` (≥ 32 characters; rotating it signs everyone out), `DATABASE_URL`, and `APP_URL` (the public `https://` address).
- Leave `ALLOW_REGISTRATION` unset unless you want public sign-up.

## Tests

`tests/security.e2e.test.ts` runs over real HTTP against a password-mode build and a throwaway database (CI does this on every push): unauthenticated access (401 / redirect), own records, cross-advocate read / edit / archive of cases, id-swapping on hearings, orders, tasks, documents, messages and research, forged office/user ids in bodies, invalid credentials and rate limiting, cookie attributes and CSRF, no secrets in any response, logout and deactivation ending sessions, and the judgments interface. Unit tests: `tests/authz.test.ts`, Argon2id in `tests/core.test.ts`, account provisioning in `tests/prisma-store.test.ts`.

## Known gaps (not done in this step)

- No sign-in **screens** beyond the existing basic login form; no registration or account pages.
- No **password reset**, email verification or invitation emails (need an email service).
- No **multi-factor authentication**.
- A member of several offices always works in the oldest membership's office (no office switcher yet).
- Sessions are fixed at 12 h; there is no "sign out everywhere" button (deleting a user's `Session` rows does it).
- The CSP does not restrict scripts (needs per-request nonces for Next.js).
- Account lockout is by rate limiting only.
- No legal or regulatory compliance assessment (e.g. India's DPDP Act, Bar Council rules) has been done; nothing here claims compliance.
