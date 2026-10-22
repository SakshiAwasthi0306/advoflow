import { NextResponse, type NextRequest } from "next/server";

// In password mode, send visitors without a session cookie to /login.
// The cookie's signature is verified on the server for every request; this is only a fast redirect.
export function middleware(req: NextRequest) {
  if (process.env.AUTH_MODE !== "password") return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/_next") || pathname === "/favicon.ico") return NextResponse.next();
  if (!req.cookies.get("advoflow_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
