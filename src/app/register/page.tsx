import Link from "next/link";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { RegisterForm } from "@/components/register-form";
import { AuthFrame } from "@/components/auth-frame";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function Register() {
  if (config.authMode === "demo") redirect("/");
  if (await getSession()) redirect("/start");
  return (
    <AuthFrame
      wide
      title="Create your account"
      subtitle={config.allowRegistration ? "For advocates and chambers. You get a new, private office of your own." : undefined}
      footer={<>Already have an account? <Link className="link font-medium" href="/login">Back to sign in</Link></>}
    >
      {config.allowRegistration
        ? <RegisterForm sms={config.smsDelivery === "log" ? "log" : "none"} twoStep={config.twoStepLogin === "required"} />
        : <p role="status" className="rounded-lg border border-line bg-neutral-soft px-3 py-2 text-sm">Self sign-up is closed on this site. Ask your office administrator for an account.</p>}
    </AuthFrame>
  );
}
