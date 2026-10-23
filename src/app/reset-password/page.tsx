import { redirect } from "next/navigation";
import Link from "next/link";
import { config } from "@/lib/config";
import { AuthFrame } from "@/components/auth-frame";
import { ResetPasswordForm } from "@/components/password-reset-forms";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default function ResetPassword({ searchParams }: { searchParams: { token?: string } }) {
  if (config.authMode === "demo") redirect("/");
  return (
    <AuthFrame title="Choose a new password" subtitle="This link works once." footer={<Link className="link" href="/login">Back to sign in</Link>}>
      <ResetPasswordForm token={searchParams.token ?? ""} />
    </AuthFrame>
  );
}
