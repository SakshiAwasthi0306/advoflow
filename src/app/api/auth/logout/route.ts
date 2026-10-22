import { cookies } from "next/headers";
import { route } from "@/lib/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const POST = route(async () => {
  cookies().delete(SESSION_COOKIE);
  return { ok: true };
});
