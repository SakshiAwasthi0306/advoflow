import { z } from "zod";
import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { AccountExistsError, createAccount } from "@/lib/auth/accounts";
import { emailSchema, passwordSchema } from "@/lib/auth/http";
import { startSignIn } from "@/lib/auth/sign-in";
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

// POST /api/auth/register -> 201 { status: "code_required", ... } exactly like /login: the new account must confirm the
// emailed code (POST /api/auth/verify) before it gets a session — which also proves the address is theirs.
// CLOSED unless ALLOW_REGISTRATION=true. Each registration creates a NEW office with the person as its owner;
// joining an existing office is done by its owner (npm run create-user -- --office ...), never by self-sign-up.
export const POST = route(async (req) => {
  if (config.authMode !== "password") throw new ValidationError("Registration is not used in demo mode.");
  if (!config.allowRegistration) throw new PermissionError("Registration is closed. Ask your office administrator for an account.");
  await hitLimit("register-ip", clientIp(req.headers), 5, 60 * 60);
  const input = body.parse(await req.json());
  try {
    const acc = await createAccount(getPrisma()!, { ...input, role: "owner", officeName: input.officeName });
    logger.info("auth.registered", { userId: acc.userId, officeId: acc.officeId });
    return startSignIn(acc.email, input.password, req.headers, 201);
  } catch (e) {
    // Same answer for "already registered" as for other refusals, without saying which.
    if (e instanceof AccountExistsError) throw new ValidationError("Could not register with these details. If you already have an account, sign in instead.");
    throw e;
  }
});
