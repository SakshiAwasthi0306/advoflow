import { z } from "zod";
import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { getAuth } from "@/lib/auth/better-auth";
import { AccountExistsError, createAccount } from "@/lib/auth/accounts";
import { emailSchema, jsonWithCookies, passwordSchema, publicUser } from "@/lib/auth/http";
import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { PermissionError, ValidationError } from "@/lib/services/workspace";
import { clientIp, hitLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const body = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: emailSchema,
  password: passwordSchema,
  officeName: z.string().trim().max(160).optional(),
});

// POST /api/auth/register -> 201 { user, office } + session cookie.
// CLOSED unless ALLOW_REGISTRATION=true. Each registration creates a NEW office with the person as its owner;
// joining an existing office is done by its owner (npm run create-user -- --office ...), never by self-sign-up.
export const POST = route(async (req) => {
  if (config.authMode !== "password") throw new ValidationError("Registration is not used in demo mode.");
  if (!config.allowRegistration) throw new PermissionError("Registration is closed. Ask your office administrator for an account.");
  await hitLimit("register-ip", clientIp(req.headers), 5, 60 * 60);
  const input = body.parse(await req.json());
  try {
    const acc = await createAccount(getPrisma()!, { ...input, role: "owner", officeName: input.officeName });
    const r = await getAuth().api.signInEmail({ body: { email: acc.email, password: input.password }, headers: req.headers, returnHeaders: true });
    logger.info("auth.registered", { userId: acc.userId, officeId: acc.officeId });
    const office = await getPrisma()!.office.findUniqueOrThrow({ where: { id: acc.officeId }, select: { id: true, name: true } });
    return jsonWithCookies({ user: publicUser(r.response.user), office: { ...office, role: "owner" } }, r.headers, 201);
  } catch (e) {
    // Same answer for "already registered" as for other refusals, without saying which.
    if (e instanceof AccountExistsError) throw new ValidationError("Could not register with these details. If you already have an account, sign in instead.");
    throw e;
  }
});
