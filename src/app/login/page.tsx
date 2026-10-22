import Link from "next/link";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  "email-changed": "Your email address was changed. Sign in with the new address.",
  "check-new-email": "Change approved. Now open the link we sent to your new address.",
  "email-verified": "Email address confirmed.",
  "link-invalid": "That link is invalid or has expired. Ask for a new one from your profile.",
  "deletion-requested": "Your account deletion request was received. You have been signed out.",
};

export default async function Login({ searchParams }: { searchParams: { notice?: string } }) {
  if (config.authMode === "demo" || (await getSession())) redirect("/");
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="font-serif text-2xl font-semibold">AdvoFlow</h1>
        <p className="mb-5 text-sm text-muted">{config.twoStepLogin === "required" ? "Sign in to your office. Two steps: your password, then a code we email you." : "Sign in to your office."}</p>
        {searchParams.notice && NOTICES[searchParams.notice] && <p role="status" className="mb-4 rounded-lg border border-line bg-neutral-soft px-3 py-2 text-sm">{NOTICES[searchParams.notice]}</p>}
        <LoginForm />
        <Link className="link mt-4 block text-center text-sm" href="/forgot-password">Forgot password?</Link>
      </div>
    </main>
  );
}
