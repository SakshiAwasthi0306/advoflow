import { z } from "zod";
import { route } from "@/lib/server";
import { getAuth } from "@/lib/auth/better-auth";
import { jsonWithCookies } from "@/lib/auth/http";
import { logger } from "@/lib/logger";
import { requireAccount } from "@/lib/profile/service";

export const runtime = "nodejs";

// POST /api/auth/sessions { action: "sign_out_other_devices" } -> ends every session of this account except this one.
export const POST = route(async (req) => {
  const s = await requireAccount();
  z.object({ action: z.literal("sign_out_other_devices") }).strict().parse(await req.json());
  const r = await getAuth().api.revokeOtherSessions({ headers: req.headers, returnHeaders: true });
  logger.info("account.other_sessions_revoked", { userId: s.userId });
  return jsonWithCookies({ status: "ok" }, r.headers);
});
