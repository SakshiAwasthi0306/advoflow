import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { getAuth } from "@/lib/auth/better-auth";
import { logger } from "@/lib/logger";
import { resetPasswordSchema } from "@/lib/profile/schemas";
import { clientIp, hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

// POST /api/auth/reset-password { token, newPassword } -> 200; the link works once, and every session of the account
// is ended (revokeSessionsOnPasswordReset).
export const POST = route(async (req) => {
  if (config.authMode !== "password") throw new ValidationError("Password reset is not used in demo mode.");
  const { token, newPassword } = resetPasswordSchema.parse(await req.json());
  await hitLimit("reset-ip", clientIp(req.headers), 20, 60 * 60);
  try {
    await getAuth().api.resetPassword({ body: { token, newPassword }, headers: req.headers });
  } catch (e) {
    if (e instanceof APIError) throw new ValidationError("This reset link is invalid or has expired. Ask for a new one.");
    throw e;
  }
  logger.info("account.password_reset");
  return NextResponse.json({ status: "password_reset", message: "Password changed. Sign in with your new password." });
});
