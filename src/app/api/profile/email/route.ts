import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { getAuth } from "@/lib/auth/better-auth";
import { getPrisma } from "@/lib/db/prisma";
import { maskEmail } from "@/lib/email";
import { errorJson, newRequestId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { confirmPassword } from "@/lib/profile/http";
import { changeEmailSchema } from "@/lib/profile/schemas";
import { DuplicateError, requireAccount } from "@/lib/profile/service";
import { hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

// POST /api/profile/email { newEmail, currentPassword }
// Nothing changes now: a link goes to the NEW address (and, if the current address is verified, the current address
// must approve first). The old address keeps working until the new one is confirmed via GET /api/auth/verify-email.
export const POST = route(async (req) => {
  const s = await requireAccount();
  const { newEmail, currentPassword } = changeEmailSchema.parse(await req.json());
  await hitLimit("email-change", s.userId, 5, 60 * 60);
  await confirmPassword(req.headers, currentPassword);
  const prisma = getPrisma()!;
  const me = await prisma.user.findUniqueOrThrow({ where: { id: s.userId }, select: { email: true, emailVerified: true } });
  if (newEmail === me.email) throw new ValidationError("That is already your email address.");
  if (await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } })) throw new DuplicateError("That email address is already used by another account.");
  if (config.emailDelivery === "none") return errorJson(503, "SERVICE_UNAVAILABLE", "Email is not set up on this server, so the new address cannot be verified yet.", newRequestId());
  try {
    await getAuth().api.changeEmail({ body: { newEmail, callbackURL: "/profile" }, headers: req.headers });
  } catch (e) {
    if (e instanceof APIError) throw new ValidationError("The email address could not be changed. Please try again.");
    throw e;
  }
  logger.info("account.email_change_requested", { userId: s.userId, step: me.emailVerified ? "approve-from-current" : "verify-new" });
  return NextResponse.json({
    status: "verification_sent",
    step: me.emailVerified ? "approve_from_current_email" : "verify_new_email",
    sentTo: maskEmail(me.emailVerified ? me.email : newEmail),
    note: "Your current email stays in use until the change is confirmed.",
  });
});
