"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useToast } from "./client";

export interface ClientValues { name: string; phone: string; email: string; preferredLanguage: "en" | "kn"; preferredChannel: "whatsapp" | "phone" | "email"; notes: string }

export function ClientForm({ id, initial, onDone }: { id?: string; initial?: Partial<ClientValues>; onDone?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<ClientValues>({ name: "", phone: "", email: "", preferredLanguage: "en", preferredChannel: "whatsapp", notes: "", ...initial });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ClientValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api(id ? `/api/clients/${id}` : "/api/clients", id ? "PATCH" : "POST", { ...v, phone: v.phone || null, email: v.email || null });
          toast(id ? "Client updated" : "Client added");
          if (!id) setV({ name: "", phone: "", email: "", preferredLanguage: "en", preferredChannel: "whatsapp", notes: "" });
          onDone?.();
          router.refresh();
        } catch (ex) {
          toast((ex as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div><label className="label" htmlFor={`cn-${id ?? "new"}`}>Name *</label><input id={`cn-${id ?? "new"}`} required className="input" value={v.name} onChange={set("name")} /></div>
      <div><label className="label" htmlFor={`cp-${id ?? "new"}`}>WhatsApp / phone</label><input id={`cp-${id ?? "new"}`} className="input" inputMode="tel" value={v.phone} onChange={set("phone")} placeholder="10-digit mobile" /></div>
      <div><label className="label" htmlFor={`ce-${id ?? "new"}`}>Email</label><input id={`ce-${id ?? "new"}`} type="email" className="input" value={v.email} onChange={set("email")} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor={`cl-${id ?? "new"}`}>Language</label><select id={`cl-${id ?? "new"}`} className="input" value={v.preferredLanguage} onChange={set("preferredLanguage")}><option value="en">English</option><option value="kn">Kannada</option></select></div>
        <div><label className="label" htmlFor={`cc-${id ?? "new"}`}>Prefers</label><select id={`cc-${id ?? "new"}`} className="input" value={v.preferredChannel} onChange={set("preferredChannel")}><option value="whatsapp">WhatsApp</option><option value="phone">Phone call</option><option value="email">Email</option></select></div>
      </div>
      <div className="sm:col-span-2"><label className="label" htmlFor={`cno-${id ?? "new"}`}>Notes</label><textarea id={`cno-${id ?? "new"}`} className="input" value={v.notes} onChange={set("notes")} /></div>
      <div><button className="btn-primary" disabled={busy}>{busy ? "Saving…" : id ? "Save" : "Add client"}</button></div>
    </form>
  );
}
