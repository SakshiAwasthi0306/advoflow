"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "./client";

// Two-step sign-in: email + password, then the 6-digit code sent by email (see docs/security.md).

type Challenge = { to: string; mode: "resend" | "log" | "none"; expiresInSeconds: number };
const RESEND_WAIT = 30;

export function LoginForm() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge]);

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null); setInfo(null);
    try {
      const r = await api<{ status: string; delivery: { to: string; mode: Challenge["mode"] }; expiresInSeconds: number }>("/api/auth/login", "POST", { email: f.get("email"), password: f.get("password") });
      if (r.status === "signed_in") { // password-only deployment
        router.replace("/profile"); // the advocate's profile is the first screen after sign-in
        router.refresh();
        return;
      }
      setChallenge({ to: r.delivery.to, mode: r.delivery.mode, expiresInSeconds: r.expiresInSeconds });
      setWait(RESEND_WAIT);
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\D/g, "");
    setBusy(true); setErr(null); setInfo(null);
    try {
      await api("/api/auth/verify", "POST", { code });
      router.replace("/profile"); // the advocate's profile is the first screen after sign-in
      router.refresh();
    } catch (ex) {
      const msg = (ex as Error).message;
      setErr(msg);
      if (/expired\. Enter your email/i.test(msg)) setChallenge(null); // challenge gone: back to step 1
      if (codeRef.current) { codeRef.current.value = ""; codeRef.current.focus(); }
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true); setErr(null); setInfo(null);
    try {
      await api("/api/auth/resend-code", "POST", {});
      setInfo("A new code is on its way. The previous code no longer works.");
      setWait(RESEND_WAIT);
    } catch (ex) {
      const msg = (ex as Error).message;
      setErr(msg);
      if (/expired\. Enter your email/i.test(msg)) setChallenge(null);
    } finally {
      setBusy(false);
    }
  }

  if (!challenge) {
    return (
      <form key="credentials" className="space-y-3" onSubmit={signIn}>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required className="input" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="input" /></div>
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
      </form>
    );
  }

  return (
    // key: a fresh form, so React never reuses the password <input> (and its typed value) for the code field.
    <form key="code" className="space-y-3" onSubmit={verify}>
      <div aria-live="polite">
        <p className="text-sm">We sent a 6-digit code to <strong>{challenge.to}</strong>. It expires in {Math.round(challenge.expiresInSeconds / 60)} minutes.</p>
        {challenge.mode === "log" && (
          <p className="mt-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">
            Email is not set up on this server (development mode): the code is written to the server log instead of being emailed.
          </p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="code">Sign-in code</label>
        <input
          ref={codeRef} id="code" name="code" required className="input text-center font-mono text-lg tracking-[0.4em]"
          inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="••••••"
          aria-describedby="code-hint"
        />
        <p id="code-hint" className="hint">Do not share this code. AdvoFlow will never ask for it by phone or chat.</p>
      </div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      {info && <p role="status" className="text-sm text-ok">{info}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" className="btn-ghost btn-sm" disabled={busy || wait > 0} onClick={resend}>{wait > 0 ? `Resend code in ${wait}s` : "Resend code"}</button>
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => { setChallenge(null); setErr(null); setInfo(null); }}>Use a different account</button>
      </div>
    </form>
  );
}
