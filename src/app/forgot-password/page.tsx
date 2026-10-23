import { redirect } from "next/navigation";
import Link from "next/link";
import { config } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { ForgotPasswordForm } from "@/components/password-reset-forms";

export const metadata = { title: "Forgot password" };

export default function ForgotPassword() {
  if (config.authMode === "demo") redirect("/");
  return (
    <AuthFrame title="Reset your password" subtitle="Enter your account email. If it has an account, we will send a link to choose a new password." footer={<Link className="link" href="/login">Back to sign in</Link>}>
      <ForgotPasswordForm />
    </AuthFrame>
  );
}
