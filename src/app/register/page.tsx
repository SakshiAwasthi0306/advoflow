import Link from "next/link";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { RegisterForm } from "@/components/register-form";

export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function Register() {
  if (config.authMode === "demo") redirect("/");
  if (await getSession()) redirect("/start");
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar px-4 py-8">
      <div className="card w-full max-w-md p-6">
        <h1 className="font-serif text-2xl font-semibold">Create your AdvoFlow account</h1>
        {config.allowRegistration ? (
          <>
            <p className="mb-5 text-sm text-muted">For advocates and chambers. You get a new, private office of your own.</p>
            <RegisterForm sms={config.smsDelivery === "log" ? "log" : "none"} twoStep={config.twoStepLogin === "required"} />
          </>
        ) : (
          <p role="status" className="mt-3 rounded-lg border border-line bg-neutral-soft px-3 py-2 text-sm">Self sign-up is closed on this site. Ask your office administrator for an account.</p>
        )}
        <p className="mt-5 text-center text-sm">Already have an account? <Link className="link" href="/login">Back to sign in</Link></p>
      </div>
    </main>
  );
}
