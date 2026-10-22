// Create a sign-in account (password mode). Needs DATABASE_URL and the Prisma migrations applied.
//
// New office, this person as owner (the first account):
//   npm run create-user -- --email asha@example.com --name "Asha Rao" --office-name "Rao Chambers" --role owner
// Join an existing office:
//   npm run create-user -- --email clerk@example.com --name "Ravi" --office <officeId> --role clerk
//
// The password is read from the ADVOFLOW_PASSWORD environment variable, or typed at a hidden prompt; it is
// never taken from the command line (that would leave it in shell history and process lists).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { AccountExistsError, createAccount } from "../src/lib/auth/accounts";
import { PASSWORD_MAX, PASSWORD_MIN } from "../src/lib/auth/password";
import type { Role } from "../src/lib/types";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function readHidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Set ADVOFLOW_PASSWORD or run this in an interactive terminal.");
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = "";
  return new Promise((resolve) => {
    process.stdin.on("data", (b: Buffer) => {
      for (const ch of b.toString("utf8")) {
        if (ch === "\r" || ch === "\n") { process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); resolve(value); return; }
        if (ch === "\u0003") process.exit(130);
        value = ch === "\u007f" ? value.slice(0, -1) : value + ch;
      }
    });
  });
}

async function main() {
  const email = arg("email");
  const name = arg("name");
  const role = (arg("role") ?? "advocate") as Role;
  const officeId = arg("office");
  const officeName = arg("office-name");
  if (!email || !name) throw new Error("Need --email and --name.");
  if (!["owner", "advocate", "clerk", "viewer"].includes(role)) throw new Error("--role must be owner, advocate, clerk or viewer.");
  if (!officeId && !officeName) throw new Error("Give --office <id> to join an office, or --office-name \"...\" to create one.");
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL first (password accounts live in PostgreSQL).");
  const password = process.env.ADVOFLOW_PASSWORD ?? (await readHidden("Password (hidden): "));
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw new Error(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`);

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const acc = await createAccount(db, { email, name, password, role, officeId, officeName });
    console.log(`Created ${acc.email} as ${role} in office ${acc.officeId}.`);
  } catch (e) {
    if (e instanceof AccountExistsError) throw new Error("An account with that email already exists.");
    throw e;
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
