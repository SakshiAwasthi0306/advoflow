"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "./client";

export function ForgotPasswordForm() {
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done) return <div className="space-y-3"><p role="status" className="text-sm">{done}</p><Link className="link text-sm" href="/login">Back to sign in</Link></div>;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr(null);
      try {
        const r = await api<{ message: string }>("/api/auth/forgot-password", "POST", { email: new FormData(e.currentTarget).get("email") });
        setDone(r.message);
      } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
    }}>
      <div><label className="label" htmlFor="fp-email">Email</label><input id="fp-email" name="email" type="email" autoComplete="username" required className="input" /></div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      <Link className="link block text-center text-sm" href="/login">Back to sign in</Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!token) return <p role="alert" className="text-sm text-danger">This reset link is incomplete. <Link className="link" href="/forgot-password">Ask for a new one.</Link></p>;
  if (done) return <div className="space-y-3"><p role="status" className="text-sm text-ok">Password changed. You were signed out on every device.</p><Link className="btn-primary w-full" href="/login">Sign in</Link></div>;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      if (f.get("newPassword") !== f.get("confirm")) { setErr("The two passwords do not match."); return; }
      setBusy(true); setErr(null);
      try { await api("/api/auth/reset-password", "POST", { token, newPassword: f.get("newPassword") }); setDone(true); }
      catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
    }}>
      <div><label className="label" htmlFor="rp-new">New password</label><input id="rp-new" name="newPassword" type="password" minLength={12} maxLength={128} required className="input" autoComplete="new-password" /></div>
      <div><label className="label" htmlFor="rp-confirm">Repeat new password</label><input id="rp-confirm" name="confirm" type="password" minLength={12} maxLength={128} required className="input" autoComplete="new-password" /></div>
      <p className="hint">At least 12 characters.</p>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Set new password"}</button>
    </form>
  );
}
