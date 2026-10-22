import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/server";
import { config } from "@/lib/config";
import { getAuth } from "@/lib/auth/better-auth";
import { getPrisma } from "@/lib/db/prisma";
import { errorJson, newRequestId } from "@/lib/http";
import { phoneSchema } from "@/lib/profile/schemas";
import { DuplicateError, requireAccount } from "@/lib/profile/service";
import { hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

// POST /api/profile/phone/send-code { phoneNumber } -> a 6-digit code by SMS to the NEW number. Nothing is saved yet;
// the current number (if any) stays until the new one is verified with POST /api/profile/phone/verify.
export const POST = route(async (req) => {
  const s = await requireAccount();
  const { phoneNumber } = z.object({ phoneNumber: phoneSchema }).strict().parse(await req.json());
  await hitLimit("phone-code", s.userId, 5, 60 * 60);
  const prisma = getPrisma()!;
  const owner = await prisma.user.findUnique({ where: { phoneNumber }, select: { id: true } });
  if (owner?.id === s.userId) throw new ValidationError("That is already your verified mobile number.");
  if (owner) throw new DuplicateError("That mobile number is already used by another account.");
  if (config.smsDelivery === "none") return errorJson(503, "SERVICE_UNAVAILABLE", "SMS is not set up on this server, so mobile numbers cannot be verified yet.", newRequestId());
  await getAuth().api.sendPhoneNumberOTP({ body: { phoneNumber } });
  return NextResponse.json({ status: "code_sent", to: `${phoneNumber.slice(0, 3)}••••••${phoneNumber.slice(-2)}`, expiresInSeconds: 300 });
});
