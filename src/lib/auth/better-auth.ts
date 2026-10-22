import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins";
import type { PrismaClient } from "@/generated/prisma/client";
import { config } from "../config";
import { getPrisma } from "../db/prisma";
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from "./password";
import { sendSignInCode } from "../email";

// Better Auth (https://better-auth.com), self-hosted on our PostgreSQL through Prisma.
// Only its server API is used (auth.api.*), from our own routes in src/app/api/auth/; its HTTP handler is
// deliberately NOT mounted, so no other auth endpoints (social sign-in, sign-up, password reset, ...) exist.

export const COOKIE_PREFIX = "advoflow";
export const SESSION_HOURS = 12;
export const CODE_MINUTES = 5; // how long an emailed sign-in code is valid
export const CHALLENGE_SECONDS = 600; // how long after the password step the code may be entered
export const CODE_ATTEMPTS = 5; // wrong codes allowed per sign-in attempt

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
    },
    // Fixed 12-hour sessions stored in the database: sign-out (or deactivating the user) ends them at once.
    // No sliding renewal: the cookie and the database row expire together.
    session: { expiresIn: SESSION_HOURS * 3600, disableSessionRefresh: true, cookieCache: { enabled: false } },
    verification: { modelName: "verificationToken" },
    user: { additionalFields: { isActive: { type: "boolean", required: false, defaultValue: true, input: false } } },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    // Two-step login: after the password, Better Auth issues no session, only a signed short-lived challenge cookie;
    // a 6-digit code is emailed (stored hashed, 5 minutes, 5 attempts) and the session is created once it is verified.
    // Every account has twoFactorEnabled = true (schema default), so the step cannot be skipped.
    plugins: [
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
