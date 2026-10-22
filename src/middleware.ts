import { NextResponse, type NextRequest } from "next/server";

// In password mode, send visitors without a session cookie to /login. Fails closed: any AUTH_MODE other than
// "demo" (or unset) requires sign-in, matching src/lib/env.ts. The health endpoints stay public.
// The cookie's signature is verified on the server for every request; this is only a fast redirect.
export function middleware(req: NextRequest) {
  const mode = process.env.AUTH_MODE?.trim().toLowerCase();
  if (!mode || mode === "demo") return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/health") || pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/_next") || pathname === "/favicon.ico") return NextResponse.next();
  if (!req.cookies.get("advoflow_session")) {
    if (pathname.startsWith("/api/")) {
      // Same shape as src/lib/http.ts (which uses node:crypto and cannot run here, in the edge runtime).
      const requestId = crypto.randomUUID();
      return NextResponse.json({ error: "Please sign in.", code: "UNAUTHENTICATED", requestId }, { status: 401, headers: { "x-request-id": requestId } });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
