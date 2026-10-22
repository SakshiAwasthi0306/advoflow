"use client";

import { useRouter } from "next/navigation";
import { api } from "./client";

export function LogoutButton() {
  const router = useRouter();
  return <button className="btn-secondary" onClick={async () => { await api("/api/auth/logout"); router.push("/login"); router.refresh(); }}>Sign out</button>;
}
