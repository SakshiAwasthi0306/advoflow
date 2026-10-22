// CSRF defence for cookie-authenticated API calls (edge-safe: used by src/middleware.ts).
// Session cookies are SameSite=Lax, so browsers do not send them on cross-site POST/PATCH/DELETE. As a second
// layer, any state-changing /api request that a browser marks as cross-site is refused:
//   - Sec-Fetch-Site (sent by all current browsers) must be "same-origin" or "none" (typed/bookmarked);
//   - otherwise, if an Origin header is present it must match this host (or APP_URL).
// Requests with neither header come from non-browser clients, which carry no ambient cookies.

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isCrossSiteWrite(method: string, h: Headers, host: string, appUrl?: string): boolean {
  if (!UNSAFE.has(method.toUpperCase())) return false;
  const site = h.get("sec-fetch-site");
  if (site) return !(site === "same-origin" || site === "none");
  const origin = h.get("origin");
  if (!origin || origin === "null") return origin === "null";
  try {
    const o = new URL(origin).host;
    if (o === host) return false;
    return !(appUrl && o === new URL(appUrl).host);
  } catch {
    return true;
  }
}
