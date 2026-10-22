import { route } from "@/lib/server";
import { COOKIE_PREFIX } from "@/lib/auth/better-auth";
import { jsonWithCookies } from "@/lib/auth/http";
import { confirmPassword } from "@/lib/profile/http";
import { deletionSchema } from "@/lib/profile/schemas";
import { requestDeletion, requireAccount } from "@/lib/profile/service";
import { hitLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// POST /api/profile/deletion-request { currentPassword, confirmation: "DELETE MY ACCOUNT", reason? }
// The account is deactivated and signed out everywhere at once; an administrator completes the deletion after 30 days.
export const POST = route(async (req) => {
  const s = await requireAccount();
  const input = deletionSchema.parse(await req.json());
  await hitLimit("deletion", s.userId, 5, 60 * 60);
  await confirmPassword(req.headers, input.currentPassword);
  const r = await requestDeletion(s.userId, input.reason);
  const res = jsonWithCookies({ status: "deletion_requested", scheduledFor: r.scheduledFor }, null);
  for (const name of [`${COOKIE_PREFIX}.session_token`, `__Secure-${COOKIE_PREFIX}.session_token`]) {
    res.headers.append("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${name.startsWith("__Secure-") ? "; Secure" : ""}`);
  }
  return res;
});
