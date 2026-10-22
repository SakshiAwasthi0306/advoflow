import type { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "../types";
import { hashPassword, normalizeEmail } from "./password";

// Account provisioning shared by POST /api/auth/register and `npm run create-user`.
// Writes exactly what Better Auth's email+password sign-in reads: a User and an Account with
// providerId "credential", accountId = user id, password = Argon2id hash. No plaintext is stored anywhere.

export class AccountExistsError extends Error {}

export interface NewAccount {
  email: string;
  name: string;
  password: string;
  role: Role;
  /** Join this existing office, or create a new one with `officeName`. */
  officeId?: string;
  officeName?: string;
}

export async function createAccount(db: PrismaClient, input: NewAccount) {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password); // hash before the transaction: it is deliberately slow
  return db.$transaction(async (tx) => {
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) throw new AccountExistsError();
    const user = await tx.user.create({ data: { email, name: input.name.trim(), emailVerified: false } });
    await tx.account.create({ data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash } });
    const office = input.officeId
      ? await tx.office.findUniqueOrThrow({ where: { id: input.officeId } })
      : await tx.office.create({ data: { name: input.officeName?.trim() || `${input.name.trim()}'s office` } });
    await tx.membership.create({ data: { officeId: office.id, userId: user.id, role: input.role.toUpperCase() as "OWNER" | "ADVOCATE" | "CLERK" | "VIEWER" } });
    return { userId: user.id, email, officeId: office.id };
  });
}
