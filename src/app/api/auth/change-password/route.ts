import { APIError } from "better-auth/api";
import { route } from "@/lib/server";
import { getAuth } from "@/lib/auth/better-auth";
import { jsonWithCookies } from "@/lib/auth/http";
import { logger } from "@/lib/logger";
import { changePasswordSchema } from "@/lib/profile/schemas";
import { requireAccount } from "@/lib/profile/service";
import { hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const runtime = "nodejs";

// POST /api/auth/change-password { currentPassword, newPassword } -> 200; every OTHER device is signed out, this one
// gets a fresh session cookie.
export const POST = route(async (req) => {
  const s = await requireAccount();
  const { currentPassword, newPassword } = changePasswordSchema.parse(await req.json());
  await hitLimit("password-change", s.userId, 10, 60 * 60);
  try {
    const r = await getAuth().api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: req.headers, returnHeaders: true });
    logger.info("account.password_changed", { userId: s.userId });
    return jsonWithCookies({ status: "password_changed", otherSessionsSignedOut: true }, r.headers);
  } catch (e) {
    if (e instanceof APIError) throw new ValidationError("Your current password is not correct.");
    throw e;
  }
});
