"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";
import { Notice } from "./ui";

// Profile sections. Each saves on its own and reports success or a clear error. Only fields the person changed are
// sent; a field left blank keeps its saved value, and "Clear" removes a value deliberately (sent as null).

type Status = { tone: "ok" | "danger"; text: string } | null;
const StatusLine = ({ s }: { s: Status }) => (s ? <div className="mt-3"><Notice tone={s.tone}>{s.text}</Notice></div> : null);

export interface ProfileFormValues {
  name: string;
  barEnrolmentNo: string | null;
  stateBarCouncil: string | null;
  yearsOfPractice: number | null;
  practiceAreas: string[];
  officeAddressLine1: string | null;
  officeAddressLine2: string | null;
  officeCity: string | null;
  officeState: string | null;
  officePincode: string | null;
  preferredCourtIds: string[];
  preferredCourtLocations: string[];
}

type TextKey = "barEnrolmentNo" | "officeAddressLine1" | "officeAddressLine2" | "officeCity" | "officeState" | "officePincode";

export function ProfileDetailsForm({ initial, councils, areas, courts, afterSave }: { initial: ProfileFormValues; councils: readonly string[]; areas: readonly string[]; courts: { id: string; name: string }[]; afterSave?: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [customArea, setCustomArea] = useState("");
  const [location, setLocation] = useState("");

  const set = <K extends keyof ProfileFormValues>(k: K, val: ProfileFormValues[K]) => {
    setV({ ...v, [k]: val });
    setCleared((c) => { const n = new Set(c); n.delete(k); return n; });
  };
  const clear = (k: keyof ProfileFormValues) => {
    setV({ ...v, [k]: Array.isArray(v[k]) ? [] : null });
    setCleared((c) => new Set(c).add(k));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (v.name.trim() && v.name !== initial.name) patch.name = v.name.trim();
    for (const k of ["barEnrolmentNo", "officeAddressLine1", "officeAddressLine2", "officeCity", "officeState", "officePincode"] as TextKey[]) {
      if (cleared.has(k)) patch[k] = null;
      else if ((v[k] ?? "").trim() && v[k] !== initial[k]) patch[k] = (v[k] ?? "").trim();
    }
    if (cleared.has("stateBarCouncil")) patch.stateBarCouncil = null;
    else if (v.stateBarCouncil && v.stateBarCouncil !== initial.stateBarCouncil) patch.stateBarCouncil = v.stateBarCouncil;
    if (cleared.has("yearsOfPractice")) patch.yearsOfPractice = null;
    else if (v.yearsOfPractice !== null && v.yearsOfPractice !== initial.yearsOfPractice) patch.yearsOfPractice = v.yearsOfPractice;
    for (const k of ["practiceAreas", "preferredCourtIds", "preferredCourtLocations"] as const) {
      if (JSON.stringify(v[k]) !== JSON.stringify(initial[k])) patch[k] = v[k];
    }
    if (!Object.keys(patch).length) {
      if (afterSave) { router.replace(afterSave); return; } // onboarding: nothing entered, carry on
      setStatus({ tone: "ok", text: "Nothing to save: no changes." }); return;
    }
    setBusy(true); setStatus(null);
    try {
      await api("/api/profile", "PATCH", patch);
      setStatus({ tone: "ok", text: "Profile saved." });
      setCleared(new Set());
      if (afterSave) { router.replace(afterSave); router.refresh(); return; }
      router.refresh();
    } catch (ex) {
      setStatus({ tone: "danger", text: `Not saved: ${(ex as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const ClearBtn = ({ k }: { k: keyof ProfileFormValues }) => {
    const val = v[k];
    const has = Array.isArray(val) ? val.length > 0 : val !== null && val !== "";
    return has ? <button type="button" className="btn-ghost btn-sm" onClick={() => clear(k)}>Clear</button> : cleared.has(k) ? <span className="text-xs text-warn">Will be cleared on save</span> : null;
  };
  const txt = (k: TextKey, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <div className="flex items-center justify-between"><label className="label" htmlFor={`p-${k}`}>{label}</label><ClearBtn k={k} /></div>
      <input id={`p-${k}`} className="input" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  );
  const toggle = (k: "practiceAreas" | "preferredCourtIds", item: string) => set(k, v[k].includes(item) ? v[k].filter((x) => x !== item) : [...v[k], item]);

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label" htmlFor="p-name">Full name</label><input id="p-name" className="input" value={v.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" required /></div>
        {txt("barEnrolmentNo", "Bar Council enrolment number", { placeholder: "e.g. KAR/1234/2015" })}
        <div>
          <div className="flex items-center justify-between"><label className="label" htmlFor="p-council">State Bar Council</label><ClearBtn k="stateBarCouncil" /></div>
          <select id="p-council" className="input" value={v.stateBarCouncil ?? ""} onChange={(e) => set("stateBarCouncil", e.target.value || null)}>
            <option value="">Choose…</option>
            {councils.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between"><label className="label" htmlFor="p-years">Years of practice</label><ClearBtn k="yearsOfPractice" /></div>
          <input id="p-years" className="input" type="number" min={0} max={70} inputMode="numeric" value={v.yearsOfPractice ?? ""} onChange={(e) => set("yearsOfPractice", e.target.value === "" ? null : Number(e.target.value))} />
        </div>
      </div>

      <fieldset>
        <div className="flex items-center justify-between"><legend className="label">Areas of practice</legend><ClearBtn k="practiceAreas" /></div>
        <div className="flex flex-wrap gap-2">
          {[...new Set([...areas, ...v.practiceAreas])].map((a) => (
            <label key={a} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${v.practiceAreas.includes(a) ? "border-navy-700 bg-navy-50 text-navy-800" : "border-line"}`}>
              <input type="checkbox" className="sr-only" checked={v.practiceAreas.includes(a)} onChange={() => toggle("practiceAreas", a)} />{a}
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input className="input" placeholder="Another area" value={customArea} onChange={(e) => setCustomArea(e.target.value)} aria-label="Another area of practice" />
          <button type="button" className="btn-secondary" onClick={() => { if (customArea.trim().length > 1) { set("practiceAreas", [...v.practiceAreas, customArea.trim()]); setCustomArea(""); } }}>Add</button>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="label sm:col-span-2">Office / chamber address</legend>
        <div className="sm:col-span-2">{txt("officeAddressLine1", "Address line 1", { autoComplete: "address-line1" })}</div>
        <div className="sm:col-span-2">{txt("officeAddressLine2", "Address line 2", { autoComplete: "address-line2" })}</div>
        {txt("officeCity", "City", { autoComplete: "address-level2" })}
        {txt("officeState", "State", { autoComplete: "address-level1" })}
        {txt("officePincode", "PIN code", { inputMode: "numeric", maxLength: 6, autoComplete: "postal-code" })}
      </fieldset>

      <fieldset>
        <div className="flex items-center justify-between"><legend className="label">Preferred courts</legend><ClearBtn k="preferredCourtIds" /></div>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-line p-2">
          {courts.map((c) => (
            <label key={c.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={v.preferredCourtIds.includes(c.id)} onChange={() => toggle("preferredCourtIds", c.id)} />{c.name}</label>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between"><span className="label">Other court locations</span><ClearBtn k="preferredCourtLocations" /></div>
        <div className="flex flex-wrap gap-2">
          {v.preferredCourtLocations.map((l) => <span key={l} className="rounded-full border border-line px-3 py-1 text-sm">{l} <button type="button" aria-label={`Remove ${l}`} className="ml-1 text-muted" onClick={() => set("preferredCourtLocations", v.preferredCourtLocations.filter((x) => x !== l))}>×</button></span>)}
        </div>
        <div className="mt-2 flex gap-2">
          <input className="input" placeholder="e.g. Mysuru, Dharwad" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Add a court location" />
          <button type="button" className="btn-secondary" onClick={() => { if (location.trim().length > 1) { set("preferredCourtLocations", [...v.preferredCourtLocations, location.trim()]); setLocation(""); } }}>Add</button>
        </div>
      </fieldset>

      <div className="flex items-center gap-3"><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : afterSave ? "Save and continue" : "Save profile"}</button><span className="hint">Blank fields keep their saved value. Use “Clear” to remove one.</span></div>
      <StatusLine s={status} />
    </form>
  );
}

export function PhotoForm({ hasPhoto, url }: { hasPhoto: boolean; url: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated image route */}
      {hasPhoto && url ? <img src={url} alt="Your profile photo" className="h-20 w-20 rounded-full border border-line object-cover" /> : <div className="grid h-20 w-20 place-items-center rounded-full border border-dashed border-line text-xs text-muted">No photo</div>}
      <div className="space-y-2">
        <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile photo" className="text-sm" disabled={busy} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true); setStatus(null);
          try {
            const fd = new FormData();
            fd.set("photo", f);
            await api("/api/profile/photo", "POST", fd);
            setStatus({ tone: "ok", text: "Photo updated." });
            router.refresh();
          } catch (ex) { setStatus({ tone: "danger", text: (ex as Error).message }); } finally { setBusy(false); }
        }} />
        <p className="hint">JPEG, PNG or WebP, up to 2 MB. Stored privately: only you can see it.</p>
        {hasPhoto && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { await api("/api/profile/photo", "DELETE"); setStatus({ tone: "ok", text: "Photo removed." }); router.refresh(); } catch (ex) { setStatus({ tone: "danger", text: (ex as Error).message }); } finally { setBusy(false); } }}>Remove photo</button>}
        <StatusLine s={status} />
      </div>
    </div>
  );
}

export function EmailChangeForm({ current }: { current: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      setBusy(true); setStatus(null);
      try {
        const r = await api<{ step: string; sentTo: string; note: string }>("/api/profile/email", "POST", { newEmail: f.get("newEmail"), currentPassword: f.get("currentPassword") });
        form.reset();
        setStatus({ tone: "ok", text: r.step === "approve_from_current_email" ? `We emailed ${r.sentTo} (your current address) to approve the change; then the new address must confirm. ${r.note}` : `We sent a confirmation link to ${r.sentTo}. ${r.note}` });
      } catch (ex) { setStatus({ tone: "danger", text: (ex as Error).message }); } finally { setBusy(false); }
    }}>
      <div><label className="label" htmlFor="newEmail">New email address</label><input id="newEmail" name="newEmail" type="email" required className="input" autoComplete="email" placeholder={current} /></div>
      <div><label className="label" htmlFor="emailPw">Current password</label><input id="emailPw" name="currentPassword" type="password" required className="input" autoComplete="current-password" /></div>
      <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy}>{busy ? "Sending…" : "Change email"}</button></div>
      <div className="sm:col-span-2"><StatusLine s={status} /></div>
    </form>
  );
}

export function PhoneForm({ current }: { current: string | null }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  if (!sent) {
    return (
      <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setStatus(null);
        try {
          const r = await api<{ to: string }>("/api/profile/phone/send-code", "POST", { phoneNumber: phone });
          setSent(r.to);
        } catch (ex) { setStatus({ tone: "danger", text: (ex as Error).message }); } finally { setBusy(false); }
      }}>
        <div className="min-w-[220px] flex-1"><label className="label" htmlFor="phone">{current ? "New mobile number" : "Mobile number"}</label><input id="phone" className="input" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
        <button className="btn-secondary" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
        <div className="w-full"><StatusLine s={status} /></div>
      </form>
    );
  }
  return (
    <form key="phone-code" className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
      e.preventDefault();
      const code = String(new FormData(e.currentTarget).get("code") ?? "");
      setBusy(true); setStatus(null);
      try {
        await api("/api/profile/phone/verify", "POST", { phoneNumber: phone, code });
        setSent(null); setPhone("");
        setStatus({ tone: "ok", text: "Mobile number verified and saved." });
        router.refresh();
      } catch (ex) { setStatus({ tone: "danger", text: (ex as Error).message }); } finally { setBusy(false); }
    }}>
      <p className="w-full text-sm">We sent a 6-digit code to {sent}. {current ? "Your current number stays until this one is verified." : ""}</p>
      <div><label className="label" htmlFor="phoneCode">Code</label><input id="phoneCode" name="code" className="input w-40 text-center font-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required autoFocus /></div>
      <button className="btn-primary" disabled={busy}>{busy ? "Verifying…" : "Verify"}</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => { setSent(null); setStatus(null); }}>Use a different number</button>
      <div className="w-full"><StatusLine s={status} /></div>
    </form>
  );
}

export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      if (f.get("newPassword") !== f.get("confirmPassword")) { setStatus({ tone: "danger", text: "The two new passwords do not match." }); return; }
      setBusy(true); setStatus(null);
      try {
        await api("/api/auth/change-password", "POST", { currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") });
        form.reset();
        setStatus({ tone: "ok", text: "Password changed. You were signed out on every other device." });
      } catch (ex) { setStatus({ tone: "danger", text: (ex as Error).message }); } finally { setBusy(false); }
    }}>
      <div className="sm:col-span-2"><label className="label" htmlFor="curPw">Current password</label><input id="curPw" name="currentPassword" type="password" required className="input" autoComplete="current-password" /></div>
      <div><label className="label" htmlFor="newPw">New password</label><input id="newPw" name="newPassword" type="password" required minLength={12} maxLength={128} className="input" autoComplete="new-password" /></div>
      <div><label className="label" htmlFor="newPw2">Repeat new password</label><input id="newPw2" name="confirmPassword" type="password" required minLength={12} maxLength={128} className="input" autoComplete="new-password" /></div>
      <p className="hint sm:col-span-2">At least 12 characters. A short sentence is easy to remember and hard to guess.</p>
      <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy}>{busy ? "Changing…" : "Change password"}</button></div>
      <div className="sm:col-span-2"><StatusLine s={status} /></div>
    </form>
  );
}

export function SessionsControl({ others }: { others: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  return (
    <div className="space-y-2">
      <p className="text-sm">{others === 0 ? "You are signed in only on this device." : `You are also signed in on ${others} other device${others === 1 ? "" : "s"}.`}</p>
      <div className="flex flex-wrap gap-2">
        {others > 0 && <button className="btn-secondary btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { await api("/api/auth/sessions", "POST", { action: "sign_out_other_devices" }); setStatus({ tone: "ok", text: "Signed out on all other devices." }); router.refresh(); } catch (ex) { setStatus({ tone: "danger", text: (ex as Error).message }); } finally { setBusy(false); } }}>Sign out other devices</button>}
        <button className="btn-secondary btn-sm" disabled={busy} onClick={async () => { await api("/api/auth/logout", "POST", {}); router.replace("/login"); router.refresh(); }}>Log out</button>
      </div>
      <StatusLine s={status} />
    </div>
  );
}

export function DeleteAccountForm({ confirmPhrase, waitDays }: { confirmPhrase: string; waitDays: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  if (!open) return <button className="btn-danger btn-sm" onClick={() => setOpen(true)}>Request account deletion…</button>;
  return (
    <form className="space-y-3 rounded-lg border border-danger-line bg-danger-soft/40 p-4" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      setBusy(true); setStatus(null);
      try {
        await api("/api/profile/deletion-request", "POST", { currentPassword: f.get("currentPassword"), confirmation: f.get("confirmation"), reason: f.get("reason") || undefined });
        router.replace("/login?notice=deletion-requested");
        router.refresh();
      } catch (ex) { setStatus({ tone: "danger", text: (ex as Error).message }); setBusy(false); }
    }}>
      <p className="text-sm font-semibold">What happens</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>You are signed out everywhere immediately and cannot sign in again.</li>
        <li>Your profile, photo and sign-in details are deleted after {waitDays} days. Until then an administrator can restore the account if you change your mind.</li>
        <li>Case records belong to your office. If you are the only person in the office, they are deleted with the account. If colleagues use the office, the records stay with them.</li>
        <li>If you are the only owner of an office others use, make one of them an owner first.</li>
      </ul>
      <div><label className="label" htmlFor="delPw">Current password</label><input id="delPw" name="currentPassword" type="password" required className="input" autoComplete="current-password" /></div>
      <div><label className="label" htmlFor="delConfirm">Type <strong>{confirmPhrase}</strong> to confirm</label><input id="delConfirm" name="confirmation" required className="input" autoComplete="off" /></div>
      <div><label className="label" htmlFor="delReason">Reason (optional)</label><input id="delReason" name="reason" className="input" maxLength={500} /></div>
      <div className="flex gap-2"><button className="btn-danger" disabled={busy}>{busy ? "Requesting…" : "Request deletion"}</button><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button></div>
      <StatusLine s={status} />
    </form>
  );
}
