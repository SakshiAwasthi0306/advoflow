"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";
import { CodeStep, type Challenge } from "./login-form";

// Self sign-up: 1. details  2. emailed code (when TWO_STEP_LOGIN is on)  3. mobile SMS code  -> profile setup -> dashboard.
// The mobile number is saved only after its SMS code is verified; with no SMS provider the step says so plainly.

type SmsMode = "log" | "none";
const PHONE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;

export function RegisterForm({ sms, twoStep }: { sms: SmsMode; twoStep: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "email-code" | "phone">("details");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toProfile = () => { router.replace("/profile?welcome=1"); router.refresh(); };

  async function register(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "");
    const mobile = v("phoneNumber").replace(/[\s-]/g, "");
    setErr(null);
    if (!PHONE_RE.test(mobile)) return setErr("Enter a valid 10-digit Indian mobile number.");
    if (v("password").length < 12) return setErr("Use at least 12 characters for the password.");
    if (v("password") !== v("confirmPassword")) return setErr("The passwords do not match.");
    setBusy(true);
    try {
      const r = await api<{ status: string; delivery?: { to: string; mode: Challenge["mode"] }; expiresInSeconds?: number }>("/api/auth/register", "POST", {
        name: v("name"), email: v("email"), phoneNumber: mobile, password: v("password"), confirmPassword: v("confirmPassword"), officeName: v("officeName") || undefined,
      });
      setPhone(mobile);
      if (r.status === "signed_in") setStep("phone");
      else { setChallenge({ to: r.delivery!.to, mode: r.delivery!.mode, expiresInSeconds: r.expiresInSeconds! }); setStep("email-code"); }
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (step === "email-code" && challenge) {
    return (
      <div className="space-y-3">
        <Steps at={2} twoStep={twoStep} />
        <CodeStep challenge={challenge} submitLabel="Verify email" backLabel="Back to sign in" onBack={() => router.replace("/login")} onVerified={() => setStep("phone")} />
      </div>
    );
  }
  if (step === "phone") return <PhoneStep sms={sms} twoStep={twoStep} initial={phone} onDone={toProfile} />;

  return (
    <form key="details" className="space-y-3" onSubmit={register} noValidate={false}>
      <Steps at={1} twoStep={twoStep} />
      <div><label className="label" htmlFor="name">Full name</label><input id="name" name="name" autoComplete="name" required maxLength={120} className="input" /></div>
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required className="input" /></div>
      <div>
        <label className="label" htmlFor="phoneNumber">Mobile number (India)</label>
        <div className="flex"><span className="inline-flex items-center rounded-l-lg border border-r-0 border-line bg-neutral-soft px-3 text-sm text-muted">+91</span>
          <input id="phoneNumber" name="phoneNumber" type="tel" inputMode="tel" autoComplete="tel-national" required placeholder="98765 43210" className="input rounded-l-none" />
        </div>
        <p className="hint">We send a code to this number to verify it.</p>
      </div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="input" aria-describedby="pw-hint" /><p id="pw-hint" className="hint">At least 12 characters.</p></div>
      <div><label className="label" htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required className="input" /></div>
      <div><label className="label" htmlFor="officeName">Chambers / office name <span className="text-muted">(optional)</span></label><input id="officeName" name="officeName" maxLength={160} className="input" /></div>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
    </form>
  );
}

function PhoneStep({ sms, twoStep, initial, onDone }: { sms: SmsMode; twoStep: boolean; initial: string; onDone: () => void }) {
  const [phone, setPhone] = useState(initial);
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sms === "none") {
    return (
      <div className="space-y-3">
        <Steps at={3} twoStep={twoStep} />
        <p className="text-sm">Your account is created.</p>
        <p role="status" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">
          Mobile verification is not available yet: no SMS service is set up on this server. Your mobile number has <strong>not</strong> been verified or saved. You can add and verify it from your profile once SMS is enabled.
        </p>
        <button className="btn-primary w-full" onClick={onDone}>Continue to your profile</button>
      </div>
    );
  }

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<{ to: string }>("/api/profile/phone/send-code", "POST", { phoneNumber: phone });
      setSent(r.to);
    } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  }
  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\D/g, "");
    setBusy(true); setErr(null);
    try {
      await api("/api/profile/phone/verify", "POST", { phoneNumber: phone, code });
      onDone();
    } catch (ex) { setErr((ex as Error).message); setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <Steps at={3} twoStep={twoStep} />
      {sms === "log" && (
        <p className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">SMS is not set up on this server (development mode): the code is written to the server log instead of being sent.</p>
      )}
      {!sent ? (
        <form key="phone" className="space-y-3" onSubmit={send}>
          <div><label className="label" htmlFor="regPhone">Mobile number (India)</label><input id="regPhone" className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send verification code"}</button>
        </form>
      ) : (
        <form key="phone-code" className="space-y-3" onSubmit={verify}>
          <p className="text-sm">We sent a 6-digit code to <strong>{sent}</strong>. It expires in 5 minutes.</p>
          <div><label className="label" htmlFor="smsCode">Code</label><input id="smsCode" name="code" className="input text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required autoFocus /></div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Verifying…" : "Verify mobile"}</button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => { setSent(null); setErr(null); }}>Change number</button>
        </form>
      )}
    </div>
  );
}

function Steps({ at, twoStep }: { at: 1 | 2 | 3; twoStep: boolean }) {
  const all: [number, string][] = [[1, "Your details"], [2, "Confirm email"], [3, "Verify mobile"], [4, "Profile"]];
  const shown = all.filter(([n]) => twoStep || n !== 2);
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Registration steps">
      {shown.map(([n, name], i) => <li key={n} aria-current={n === at ? "step" : undefined} className={n === at ? "font-semibold text-ink" : ""}>{i + 1}. {name}</li>)}
    </ol>
  );
}
