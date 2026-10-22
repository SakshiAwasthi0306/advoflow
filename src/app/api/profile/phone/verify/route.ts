import { NextResponse } from "next/server";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { route } from "@/lib/server";
import { getAuth } from "@/lib/auth/better-auth";
import { getPrisma } from "@/lib/db/prisma";
import { phoneSchema } from "@/lib/profile/schemas";
import { DuplicateError, requireAccount } from "@/lib/profile/service";
import { hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

// POST /api/profile/phone/verify { phoneNumber, code } -> saves the number as verified, for the signed-in account only.
export const POST = route(async (req) => {
  const s = await requireAccount();
  const { phoneNumber, code } = z.object({ phoneNumber: phoneSchema, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") }).strict().parse(await req.json());
  await hitLimit("phone-verify", s.userId, 20, 60 * 60);
  try {
    await getAuth().api.verifyPhoneNumber({ body: { phoneNumber, code, updatePhoneNumber: true, disableSession: true }, headers: req.headers });
  } catch (e) {
    if (e instanceof APIError) {
      if (/exist/i.test(e.message)) throw new DuplicateError("That mobile number is already used by another account.");
      throw new ValidationError("That code is not correct or has expired. Request a new code.");
    }
    throw e;
  }
  const u = await getPrisma()!.user.findUniqueOrThrow({ where: { id: s.userId }, select: { phoneNumber: true, phoneNumberVerified: true } });
  return NextResponse.json({ status: "verified", phoneNumber: u.phoneNumber, phoneNumberVerified: u.phoneNumberVerified });
});
