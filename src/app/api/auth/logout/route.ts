import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { getAuth } from "@/lib/auth/better-auth";
import { COOKIE_PREFIX } from "@/lib/auth/better-auth";
import { jsonWithCookies } from "@/lib/auth/http";

export const runtime = "nodejs";

// POST /api/auth/logout -> 200 { ok: true }. Deletes the session row (so the cookie is dead even if it was copied)
// and expires the cookie. Safe to call when not signed in.
export const POST = route(async (req) => {
  if (config.authMode !== "password") return jsonWithCookies({ ok: true }, null);
  let cookies: Headers | null = null;
  try {
    cookies = (await getAuth().api.signOut({ headers: req.headers, returnHeaders: true })).headers;
  } catch {
    cookies = null; // no valid session: still clear any cookie below
  }
  const res = jsonWithCookies({ ok: true }, cookies);
  if (!cookies?.getSetCookie().length) {
    for (const name of [`${COOKIE_PREFIX}.session_token`, `__Secure-${COOKIE_PREFIX}.session_token`]) {
      res.headers.append("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${name.startsWith("__Secure-") ? "; Secure" : ""}`);
    }
  }
  return res;
});
