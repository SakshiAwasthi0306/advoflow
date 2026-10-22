"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";

export function LoginForm() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      setBusy(true); setErr(null);
      try { await api("/api/auth/login", "POST", { email: f.get("email"), password: f.get("password") }); router.push("/"); router.refresh(); }
      catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
    }}>
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required className="input" /></div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="input" /></div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
