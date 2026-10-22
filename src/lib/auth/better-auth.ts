import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import { config } from "../config";
import { getPrisma } from "../db/prisma";
import { hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from "./password";

// Better Auth (https://better-auth.com), self-hosted on our PostgreSQL through Prisma.
// Only its server API is used (auth.api.*), from our own routes in src/app/api/auth/; its HTTP handler is
// deliberately NOT mounted, so no other auth endpoints (social sign-in, sign-up, password reset, ...) exist.

export const COOKIE_PREFIX = "advoflow";
export const SESSION_HOURS = 12;

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
