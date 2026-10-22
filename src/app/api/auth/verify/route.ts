import { z } from "zod";
import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { finishSignIn } from "@/lib/auth/sign-in";
import { clientIp, hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

const body = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.") });

// POST /api/auth/verify { code } (with the challenge cookie from /login)
//   -> 200 { user, office: { id, name, role } } + session cookie
//   -> 401 wrong/expired code, or no challenge (sign in again); 5 wrong codes end the challenge · 429
export const POST = route(async (req) => {
  if (config.authMode !== "password") throw new ValidationError("Sign-in is not used in demo mode.");
  const { code } = body.parse(await req.json());
  await hitLimit("verify-ip", clientIp(req.headers), 30, 15 * 60);
  return finishSignIn(code, req.headers);
});
