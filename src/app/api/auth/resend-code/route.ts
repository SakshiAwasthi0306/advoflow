import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { resendCode } from "@/lib/auth/sign-in";
import { clientIp, hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

// POST /api/auth/resend-code (with the challenge cookie) -> 200 { status: "code_sent" }; the previous code stops working.
//   -> 401 no challenge (sign in again) · 429 (3 per 10 minutes per address)
export const POST = route(async (req) => {
  if (config.authMode !== "password") throw new ValidationError("Sign-in is not used in demo mode.");
  await hitLimit("resend-ip", clientIp(req.headers), 3, 10 * 60);
  return resendCode(req.headers);
});
