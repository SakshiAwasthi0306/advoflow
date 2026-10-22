import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "./password";

// Shared pieces of the /api/auth/* routes.

export const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
export const passwordSchema = z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

/** JSON response that also carries the Set-Cookie headers produced by Better Auth. Never cached. */
export function jsonWithCookies(body: unknown, from: Headers | null, status = 200) {
  const res = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  for (const c of from?.getSetCookie() ?? []) res.headers.append("set-cookie", c);
  return res;
}

/** What the API ever says about a user: never a password, hash, token or session id. */
export const publicUser = (u: { id: string; email: string; name: string }) => ({ id: u.id, email: u.email, name: u.name });
