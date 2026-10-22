import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { DEMO_SESSION } from "./auth/demo";
import { getAuth } from "./auth/better-auth";
import { config } from "./config";
import { getPrisma } from "./db/prisma";
import { UnauthenticatedError } from "./http";
import type { Role, Session } from "./types";

/**
 * The ONLY source of the current user, office and role. Never trust ids from the request body, URL or query for this.
 * Password mode: Better Auth validates the session cookie against the Session table; the user must still be active and
 * a member of an office, and the role is read fresh from the database on every request (role changes apply at once).
 * Memoised per request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  if (config.authMode === "demo") return DEMO_SESSION;
  return resolveSession(headers());
});

export async function resolveSession(h: Headers): Promise<Session | null> {
  const prisma = getPrisma();
  if (!prisma || config.authSecret.length < 32) return null; // misconfigured: fail closed (reported by /api/health)
  const found = await getAuth().api.getSession({ headers: h }).catch(() => null);
  if (!found) return null;
  const user = await prisma.user.findUnique({
    where: { id: found.user.id },
    select: { id: true, name: true, isActive: true, memberships: { orderBy: { createdAt: "asc" }, take: 1, select: { officeId: true, role: true } } },
  });
  const m = user?.memberships[0];
  if (!user || !user.isActive || !m) return null;
  return { userId: user.id, officeId: m.officeId, role: m.role.toLowerCase() as Role, name: user.name, mode: "password" };
}

export { UnauthenticatedError };

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new UnauthenticatedError("Please sign in.");
  return s;
}
