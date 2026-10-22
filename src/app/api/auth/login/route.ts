import { z } from "zod";
import { cookies } from "next/headers";
import { route, rateLimit } from "@/lib/server";
import { config } from "@/lib/config";
import { getStore } from "@/lib/store";
import { SESSION_COOKIE, signSession, verifyPassword } from "@/lib/auth";
import { UnauthenticatedError } from "@/lib/session";

export const POST = route(async (req) => {
  if (config.authMode !== "password") return { ok: true };
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(await req.json());
  rateLimit(`login:${email.toLowerCase()}`, 5);
  const store = getStore();
  const user = await store.findUserByEmail(email.toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) throw new UnauthenticatedError("Email or password is incorrect.");
  const m = (await store.membershipsFor(user.id))[0];
  if (!m) throw new UnauthenticatedError("This account is not a member of any office.");
  cookies().set(SESSION_COOKIE, signSession({ uid: user.id, oid: m.officeId, role: m.role, name: user.name }, config.authSecret), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600,
  });
  return { ok: true };
});
