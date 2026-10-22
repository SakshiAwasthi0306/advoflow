import { hash, verify } from "@node-rs/argon2";

// Argon2id with the OWASP Password Storage Cheat Sheet baseline: 19 MiB memory, 2 iterations, 1 lane.
// The algorithm and parameters are stored inside each hash ($argon2id$v=19$m=19456,t=2,p=1$...),
// so they can be raised later without breaking existing passwords.
const ARGON2ID = 2; // @node-rs/argon2 Algorithm.Argon2id (a const enum, so written out here)
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** Constant-time verification inside the library. A malformed stored hash counts as a mismatch, never an error. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  if (!storedHash.startsWith("$argon2id$")) return false;
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/** Trim and lower-case; the database enforces uniqueness on the normalised value. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
