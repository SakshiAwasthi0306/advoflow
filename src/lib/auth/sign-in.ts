import "server-only";
import { APIError } from "better-auth/api";
import { config } from "../config";
import { getPrisma } from "../db/prisma";
import { maskEmail } from "../email";
import { errorJson, newRequestId, UnauthenticatedError } from "../http";
import { logger } from "../logger";
import { limitKey } from "../rate-limit";
import { CODE_MINUTES, COOKIE_PREFIX, getAuth } from "./better-auth";
import { GENERIC_LOGIN_ERROR, jsonWithCookies, publicUser } from "./http";

// The two halves of the two-step sign-in, shared by /api/auth/login, /register, /verify and /resend-code.

export const WRONG_CODE = "That code is not correct or has expired. Use the latest code, or sign in again.";
export const CHALLENGE_GONE = "Your sign-in has expired. Enter your email and password again.";

/** Accounts that may sign in: active, with an office. Read fresh from the database. */
async function usableAccount(where: { id: string } | { email: string }) {
  const user = await getPrisma()!.user.findUnique({
    where,
    select: { id: true, email: true, name: true, isActive: true, memberships: { orderBy: { createdAt: "asc" }, take: 1, include: { office: { select: { id: true, name: true } } } } },
  });
  const m = user?.memberships[0];
  return user && user.isActive && m ? { user, membership: m } : null;
}

/** "name=value" pairs from Set-Cookie headers, to pass a cookie Better Auth just set into the next server call. */
const cookiePairs = (h: Headers) => h.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");

/** Step 1: password -> challenge cookie + emailed code. Never creates a session. */
export async function startSignIn(email: string, password: string, headers: Headers, status = 200) {
  const auth = getAuth();
  let r: Awaited<ReturnType<typeof auth.api.signInEmail>> extends infer R ? { headers: Headers; response: R } : never;
  try {
    r = (await auth.api.signInEmail({ body: { email, password }, headers, returnHeaders: true })) as typeof r;
  } catch (e) {
    if (e instanceof APIError) {
      logger.info("auth.login_failed", { who: limitKey("login-email", email) });
      throw new UnauthenticatedError(GENERIC_LOGIN_ERROR);
    }
    throw e;
  }
  const res = r.response as { twoFactorRedirect?: boolean; token?: string | null; user?: { id: string } };
  if (config.twoStepLogin === "off" && !res.twoFactorRedirect && res.token && res.user) {
    // Password-only deployment (TWO_STEP_LOGIN=off): Better Auth already created the session.
    const acc = await usableAccount({ id: res.user.id });
    if (!acc) {
      await getPrisma()!.session.deleteMany({ where: { token: res.token } });
      logger.warn("auth.login_refused", { who: limitKey("login-email", email) });
      throw new UnauthenticatedError(GENERIC_LOGIN_ERROR);
    }
    logger.info("auth.login", { userId: acc.user.id, officeId: acc.membership.officeId, twoStep: "off" });
    return jsonWithCookies({ status: "signed_in", user: publicUser(acc.user), office: { id: acc.membership.office.id, name: acc.membership.office.name, role: acc.membership.role.toLowerCase() } }, r.headers, status);
  }
  if (!res.twoFactorRedirect) {
    // Two-step login switched off for this account (should never happen): refuse rather than skip the code.
    if (res.token) await getPrisma()!.session.deleteMany({ where: { token: res.token } });
    logger.error("auth.two_factor_missing", { who: limitKey("login-email", email) });
    throw new UnauthenticatedError(GENERIC_LOGIN_ERROR);
  }
  const acc = await usableAccount({ email });
  if (!acc) {
    logger.warn("auth.login_refused", { who: limitKey("login-email", email) });
    return withExpiredChallenge(errorJson(401, "UNAUTHENTICATED", GENERIC_LOGIN_ERROR, newRequestId()));
  }
  if (config.emailDelivery === "none") {
    logger.error("auth.code_not_sent", { reason: "email not configured" });
    return withExpiredChallenge(errorJson(503, "SERVICE_UNAVAILABLE", "Sign-in codes cannot be sent: email is not set up on this server. Contact your administrator.", newRequestId()));
  }
  await auth.api.sendTwoFactorOTP({ headers: new Headers({ cookie: cookiePairs(r.headers) }), body: {} });
  logger.info("auth.code_sent", { userId: acc.user.id });
  return jsonWithCookies({
    status: "code_required",
    delivery: { channel: "email", to: maskEmail(acc.user.email), mode: config.emailDelivery },
    expiresInSeconds: CODE_MINUTES * 60,
  }, r.headers, status);
}

/** Step 2: code -> session cookie. The account is checked again (it may have been deactivated in between). */
export async function finishSignIn(code: string, headers: Headers) {
  const auth = getAuth();
  let r: { headers: Headers; response: { token: string; user: { id: string } } };
  try {
    r = (await auth.api.verifyTwoFactorOTP({ body: { code }, headers, returnHeaders: true })) as unknown as typeof r;
  } catch (e) {
    if (e instanceof APIError) {
      const gone = !headers.get("cookie")?.includes(`${COOKIE_PREFIX}.two_factor`);
      logger.info("auth.code_failed", { reason: gone ? "no_challenge" : "wrong_or_expired" });
      throw new UnauthenticatedError(gone ? CHALLENGE_GONE : WRONG_CODE);
    }
    throw e;
  }
  const acc = await usableAccount({ id: r.response.user.id });
  if (!acc) {
    await getPrisma()!.session.deleteMany({ where: { token: r.response.token } });
    throw new UnauthenticatedError(GENERIC_LOGIN_ERROR);
  }
  logger.info("auth.login", { userId: acc.user.id, officeId: acc.membership.officeId });
  return jsonWithCookies({ user: publicUser(acc.user), office: { id: acc.membership.office.id, name: acc.membership.office.name, role: acc.membership.role.toLowerCase() } }, r.headers);
}

/** Send a fresh code for the current challenge. */
export async function resendCode(headers: Headers) {
  if (config.emailDelivery === "none") return errorJson(503, "SERVICE_UNAVAILABLE", "Sign-in codes cannot be sent: email is not set up on this server.", newRequestId());
  try {
    await getAuth().api.sendTwoFactorOTP({ headers, body: {} });
  } catch (e) {
    if (e instanceof APIError) throw new UnauthenticatedError(CHALLENGE_GONE);
    throw e;
  }
  return jsonWithCookies({ status: "code_sent", expiresInSeconds: CODE_MINUTES * 60 }, null);
}

function withExpiredChallenge(res: Response) {
  for (const name of [`${COOKIE_PREFIX}.two_factor`, `__Secure-${COOKIE_PREFIX}.two_factor`]) {
    res.headers.append("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${name.startsWith("__Secure-") ? "; Secure" : ""}`);
  }
  return res;
}
