import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteWrite } from "@/lib/csrf";

// Runs before every request (edge runtime). Two jobs:
//  1. CSRF: refuse state-changing /api requests that a browser marks as cross-site (all modes, incl. the demo).
//  2. Password mode: send visitors without a session cookie to /login (pages) or answer 401 (API). This is only a
//     fast first gate; the cookie is fully verified against the database by src/lib/session.ts on every request.
// Fails closed: any AUTH_MODE other than "demo" (or unset) requires sign-in, matching src/lib/env.ts.

const PUBLIC = ["/api/health", "/login", "/api/auth/login", "/api/auth/verify", "/api/auth/resend-code", "/api/auth/register", "/api/auth/logout", "/_next", "/favicon.ico"];

function deny(status: 401 | 403, code: "UNAUTHENTICATED" | "FORBIDDEN", message: string) {
  const requestId = crypto.randomUUID(); // same shape as src/lib/http.ts (node:crypto is not available here)
  return NextResponse.json({ error: message, code, requestId }, { status, headers: { "x-request-id": requestId, "Cache-Control": "no-store" } });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/") && isCrossSiteWrite(req.method, req.headers, req.nextUrl.host, process.env.APP_URL)) {
    return deny(403, "FORBIDDEN", "Cross-site request blocked.");
  }
  const mode = process.env.AUTH_MODE?.trim().toLowerCase();
  if (!mode || mode === "demo") return NextResponse.next();
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  // Cookie names set by Better Auth (src/lib/auth/better-auth.ts, prefix "advoflow"); "__Secure-" in production.
  if (!req.cookies.get("advoflow.session_token") && !req.cookies.get("__Secure-advoflow.session_token")) {
    if (pathname.startsWith("/api/")) return deny(401, "UNAUTHENTICATED", "Please sign in.");
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
