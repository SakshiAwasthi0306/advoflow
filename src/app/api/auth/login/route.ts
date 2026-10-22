import { z } from "zod";
import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { emailSchema } from "@/lib/auth/http";
import { startSignIn } from "@/lib/auth/sign-in";
import { clientIp, hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

const body = z.object({ email: emailSchema, password: z.string().min(1).max(200) });

// POST /api/auth/login { email, password }
//   -> 200 { status: "code_required", delivery: { channel: "email", to: "as•••@example.com" }, expiresInSeconds }
//      + a short-lived challenge cookie (NOT a session); a 6-digit code is emailed. Finish with POST /api/auth/verify.
//   -> 401 always the same message (unknown email, wrong password, inactive or office-less account) · 429 · 503 (no email)
export const POST = route(async (req) => {
  if (config.authMode !== "password") throw new ValidationError("Sign-in is not used in demo mode.");
  const { email, password } = body.parse(await req.json());
  await hitLimit("login-ip", clientIp(req.headers), 30, 15 * 60); // per address
  await hitLimit("login-email", email, 8, 15 * 60); // per account, from any address
  return startSignIn(email, password, req.headers);
});
