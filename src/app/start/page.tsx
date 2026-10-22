import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { firstScreenFor } from "@/lib/profile/service";

// Landing step right after sign-in: new advocates set up their profile first; everyone else goes to the dashboard.
export const dynamic = "force-dynamic";

export default async function Start() {
  const s = await getSession();
  if (!s) redirect("/login");
  redirect(s.mode === "password" ? await firstScreenFor(s.userId) : "/");
}
