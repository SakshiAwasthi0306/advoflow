import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Role, Session } from "./types";

// Password hashing (scrypt) and HMAC-signed session tokens. No third-party auth dependency.

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(hashHex, "hex");
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}

interface TokenBody {
  uid: string;
  oid: string;
  role: Role;
  name: string;
  exp: number;
}

export function signSession(body: Omit<TokenBody, "exp">, secret: string, ttlHours = 12): string {
  if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  const payload = Buffer.from(JSON.stringify({ ...body, exp: Date.now() + ttlHours * 3600_000 })).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readSession(token: string | undefined, secret: string): Session | null {
  if (!token || !secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenBody;
    if (typeof body.exp !== "number" || body.exp < Date.now()) return null;
    return { userId: body.uid, officeId: body.oid, role: body.role, name: body.name, mode: "password" };
  } catch {
    return null;
  }
}

export const DEMO_SESSION: Session = { userId: "user_demo", officeId: "office_demo", role: "owner", name: "Demo Advocate", mode: "demo" };
export const SESSION_COOKIE = "advoflow_session";
