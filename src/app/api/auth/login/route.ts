import { z } from "zod";
import { APIError } from "better-auth/api";
import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { getAuth } from "@/lib/auth/better-auth";
import { emailSchema, GENERIC_LOGIN_ERROR, jsonWithCookies, publicUser } from "@/lib/auth/http";
import { getPrisma } from "@/lib/db/prisma";
import { UnauthenticatedError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { clientIp, hitLimit, limitKey } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

const body = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

// POST /api/auth/login { email, password } -> 200 { user, office } + session cookie | 401 (always the same message)
export const POST = route(async (req) => {
  if (config.authMode !== "password") throw new ValidationError("Sign-in is not used in demo mode.");
  const { email, password } = body.parse(await req.json());
  const ip = clientIp(req.headers);
  await hitLimit("login-ip", ip, 30, 15 * 60); // per address
  await hitLimit("login-email", email, 8, 15 * 60); // per account, from any address

  let signedIn: Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["signInEmail"]>> | undefined;
  let cookies: Headers | null = null;
  try {
    const r = await getAuth().api.signInEmail({ body: { email, password }, headers: req.headers, returnHeaders: true });
    signedIn = r.response;
    cookies = r.headers;
  } catch (e) {
    if (e instanceof APIError) {
      logger.info("auth.login_failed", { who: limitKey("login-email", email), ip: limitKey("ip", ip) });
      throw new UnauthenticatedError(GENERIC_LOGIN_ERROR);
    }
    throw e;
  }

  // The password was right; the account must also be active and belong to an office.
  const prisma = getPrisma()!;
  const user = await prisma.user.findUnique({
    where: { id: signedIn.user.id },
    select: { id: true, email: true, name: true, isActive: true, memberships: { orderBy: { createdAt: "asc" }, take: 1, include: { office: { select: { id: true, name: true } } } } },
  });
  const m = user?.memberships[0];
  if (!user || !user.isActive || !m) {
    await prisma.session.deleteMany({ where: { token: signedIn.token } }); // undo the session Better Auth just created
    logger.warn("auth.login_refused", { reason: !user?.isActive ? "inactive" : "no_office", who: limitKey("login-email", email) });
    throw new UnauthenticatedError(GENERIC_LOGIN_ERROR);
  }
  logger.info("auth.login", { userId: user.id, officeId: m.officeId });
  return jsonWithCookies({ user: publicUser(user), office: { id: m.office.id, name: m.office.name, role: m.role.toLowerCase() } }, cookies);
});
