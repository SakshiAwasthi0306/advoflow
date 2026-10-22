import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import type { PrismaClient } from "@/generated/prisma/client";
import { config } from "../config";
import { getPrisma } from "../db/prisma";
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from "./password";
import { sendLinkEmail, sendSignInCode } from "../email";
import { sendSms } from "../sms";

// Better Auth (https://better-auth.com), self-hosted on our PostgreSQL through Prisma.
// Only its server API is used (auth.api.*), from our own routes in src/app/api/auth/; its HTTP handler is
// deliberately NOT mounted, so no other auth endpoints (social sign-in, sign-up, password reset, ...) exist.

export const COOKIE_PREFIX = "advoflow";
export const SESSION_HOURS = 12;
export const CODE_MINUTES = 5; // how long an emailed sign-in code is valid
export const CHALLENGE_SECONDS = 600; // how long after the password step the code may be entered
export const CODE_ATTEMPTS = 5; // wrong codes allowed per sign-in attempt
export const RESET_MINUTES = 30; // password-reset links
export const EMAIL_LINK_MINUTES = 60; // email-change links

/** Public base address for links in emails: APP_URL, else the address the request came in on (local development). */
export function appBase(request?: Request | null): string {
  if (config.appUrl) return config.appUrl.replace(/\/$/, "");
  if (request?.url) return new URL(request.url).origin;
  return "http://localhost:3000";
}

function createAuth(prisma: PrismaClient) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: config.authSecret,
    baseURL: config.appUrl ?? undefined,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      autoSignIn: true,
      password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(hash, password) },
      // Forgot password: a single-use link (30 min) to /reset-password; resetting signs the account out everywhere.
      resetPasswordTokenExpiresIn: RESET_MINUTES * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }, request) => sendLinkEmail(user.email, "reset-password", `${appBase(request)}/reset-password?token=${encodeURIComponent(token)}`),
    },
    // Changing the sign-in email: the NEW address must open a link before anything changes (the old address keeps
    // working until then). If the current address is already verified, it must approve the change first.
    emailVerification: {
      expiresIn: EMAIL_LINK_MINUTES * 60,
      sendVerificationEmail: async ({ user, token }, request) => sendLinkEmail(user.email, "verify-email", `${appBase(request)}/api/auth/verify-email?token=${encodeURIComponent(token)}`),
    },
    // Fixed 12-hour sessions stored in the database: sign-out (or deactivating the user) ends them at once.
    // No sliding renewal: the cookie and the database row expire together.
    session: { expiresIn: SESSION_HOURS * 3600, disableSessionRefresh: true, cookieCache: { enabled: false } },
    verification: { modelName: "verificationToken" },
    user: {
      additionalFields: { isActive: { type: "boolean", required: false, defaultValue: true, input: false } },
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
        sendChangeEmailConfirmation: async ({ user, token }, request) => sendLinkEmail(user.email, "confirm-email-change", `${appBase(request)}/api/auth/verify-email?token=${encodeURIComponent(token)}`),
      },
    },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    // Two-step login: after the password, Better Auth issues no session, only a signed short-lived challenge cookie;
    // a 6-digit code is emailed (stored hashed, 5 minutes, 5 attempts) and the session is created once it is verified.
    // Every account has twoFactorEnabled = true (schema default), so the step cannot be skipped — unless the whole
    // deployment opts out with TWO_STEP_LOGIN=off (password only; reported as "not live" in Settings).
    plugins: [
      // Mobile numbers: a 6-digit code to the NEW number (5 min, 5 attempts); the number is saved only after it is
      // verified, and never if another account already uses it. Sign-in by phone is not offered (no route calls it).
      phoneNumber({
        otpLength: 6,
        expiresIn: 5 * 60,
        allowedAttempts: 5,
        sendOTP: ({ phoneNumber, code }) => sendSms(phoneNumber, `Your AdvoFlow verification code is ${code}. It expires in 5 minutes.`, code),
      }),
      ...(config.twoStepLogin === "off" ? [] : [
      twoFactor({
        issuer: "AdvoFlow",
        totpOptions: { disable: true }, // authenticator apps: not offered yet
        twoFactorCookieMaxAge: CHALLENGE_SECONDS,
        otpOptions: {
          digits: 6,
          period: CODE_MINUTES,
          allowedAttempts: CODE_ATTEMPTS,
          storeOTP: "hashed",
          sendOTP: async ({ user, otp }) => sendSignInCode({ email: user.email, name: user.name }, otp),
        },
      }),
      ]),
    ],
    rateLimit: { enabled: false }, // our routes apply database-backed limits (src/lib/rate-limit.ts)
    telemetry: { enabled: false },
  });
}

let instance: ReturnType<typeof createAuth> | null = null;

/** The Better Auth instance. Password mode requires DATABASE_URL (sessions and credentials live in PostgreSQL). */
export function getAuth() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Password sign-in needs DATABASE_URL (PostgreSQL).");
  instance ??= createAuth(prisma);
  return instance;
}
