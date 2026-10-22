import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { getAuth } from "@/lib/auth/better-auth";
import { emailSchema } from "@/lib/auth/http";
import { errorJson, newRequestId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { clientIp, hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

const SAME_ANSWER = "If an account uses that address, a password-reset link is on its way. It expires in 30 minutes.";

// POST /api/auth/forgot-password { email } -> always the same answer, whether or not the address has an account.
export const POST = route(async (req) => {
  if (config.authMode !== "password") throw new ValidationError("Password reset is not used in demo mode.");
  const { email } = z.object({ email: emailSchema }).strict().parse(await req.json());
  await hitLimit("forgot-ip", clientIp(req.headers), 10, 60 * 60);
  await hitLimit("forgot-email", email, 3, 60 * 60);
  if (config.emailDelivery === "none") return errorJson(503, "SERVICE_UNAVAILABLE", "Email is not set up on this server, so reset links cannot be sent. Contact your administrator.", newRequestId());
  try {
    await getAuth().api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" }, headers: req.headers });
  } catch (e) {
    logger.warn("auth.reset_request_failed", { name: (e as Error).name }); // never reveal whether the address exists
  }
  return NextResponse.json({ status: "ok", message: SAME_ANSWER });
});
