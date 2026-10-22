import "server-only";
import { cookies } from "next/headers";
import { DEMO_SESSION, readSession, SESSION_COOKIE } from "./auth";
import { config } from "./config";
import type { Session } from "./types";

/** The only source of officeId and role for any request. Never trust the request body for these. */
export function getSession(): Session | null {
  if (config.authMode === "demo") return DEMO_SESSION;
  return readSession(cookies().get(SESSION_COOKIE)?.value, config.authSecret);
}

export class UnauthenticatedError extends Error {
  status = 401;
}

export function requireSession(): Session {
  const s = getSession();
  if (!s) throw new UnauthenticatedError("Please sign in.");
  return s;
}
