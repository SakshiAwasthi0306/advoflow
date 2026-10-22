import { NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { getAuth } from "@/lib/auth/better-auth";
import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/auth/verify-email?token=... — the link in email-change messages. Better Auth checks the token's signature
// and expiry; we only read its claims to decide what to say. When the new address is confirmed, every session of that
// account is ended (the sign-in identifier changed), and the person signs in again with the new address.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const to = (notice: string) => NextResponse.redirect(new URL(`/login?notice=${notice}`, url.origin), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  let claims: { email?: string; updateTo?: string; requestType?: string } = {};
  try {
    claims = decodeJwt(token) as typeof claims;
  } catch {
    return to("link-invalid");
  }
  try {
    await getAuth().api.verifyEmail({ query: { token } });
  } catch {
    return to("link-invalid");
  }
  if (claims.requestType === "change-email-confirmation") return to("check-new-email"); // approved; now the new address must confirm
  if (claims.requestType === "change-email-verification" && claims.updateTo) {
    const user = await getPrisma()!.user.findUnique({ where: { email: claims.updateTo.toLowerCase() }, select: { id: true } });
    if (user) {
      await getPrisma()!.session.deleteMany({ where: { userId: user.id } });
      logger.info("account.email_changed", { userId: user.id });
    }
    return to("email-changed");
  }
  return to("email-verified");
}
