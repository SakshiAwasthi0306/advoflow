import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { ForgotPasswordForm } from "@/components/password-reset-forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPassword() {
  if (config.authMode === "demo") redirect("/");
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="font-serif text-2xl font-semibold">Reset your password</h1>
        <p className="mb-5 text-sm text-muted">Enter your account email. If it has an account, we will send a link to choose a new password.</p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
