import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { ResetPasswordForm } from "@/components/password-reset-forms";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default function ResetPassword({ searchParams }: { searchParams: { token?: string } }) {
  if (config.authMode === "demo") redirect("/");
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="font-serif text-2xl font-semibold">Choose a new password</h1>
        <p className="mb-5 text-sm text-muted">This link works once.</p>
        <ResetPasswordForm token={searchParams.token ?? ""} />
      </div>
    </main>
  );
}
