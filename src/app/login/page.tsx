import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in" };

export default function Login() {
  if (config.authMode === "demo" || getSession()) redirect("/");
  return (
    <main className="grid min-h-screen place-items-center bg-sidebar px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="font-serif text-2xl font-semibold">AdvoFlow</h1>
        <p className="mb-5 text-sm text-muted">Sign in to your office.</p>
        <LoginForm />
      </div>
    </main>
  );
}
