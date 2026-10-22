// Create a user and add them to an office (password mode).
// Usage: npm run create-user -- --email a@b.c --name "Asha Rao" --password '...' --office office_main --office-name "Rao Chambers" --role owner
import { randomUUID } from "node:crypto";
import path from "node:path";
import { hashPassword } from "../src/lib/auth";
import { FileStore } from "../src/lib/store/file-store";
import { PostgresStore } from "../src/lib/store/postgres-store";
import { emptyWorkspace } from "../src/lib/services/workspace";
import type { Role } from "../src/lib/types";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const email = arg("email")?.toLowerCase();
  const name = arg("name");
  const password = arg("password");
  const office = arg("office") ?? "office_main";
  const officeName = arg("office-name") ?? "My Office";
  const role = (arg("role") ?? "advocate") as Role;
  if (!email || !name || !password || password.length < 10) throw new Error("Need --email, --name and --password (10+ characters).");
  if (!["owner", "advocate", "clerk", "viewer"].includes(role)) throw new Error("Role must be owner, advocate, clerk or viewer.");
  const store = process.env.DATABASE_URL ? new PostgresStore(process.env.DATABASE_URL) : new FileStore(path.resolve(process.env.ADVOFLOW_DATA_DIR || ".data"));
  let user = await store.findUserByEmail(email);
  if (!user) {
    user = { id: `user_${randomUUID().replace(/-/g, "").slice(0, 16)}`, email, name, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    await store.createUser(user);
  }
  let ws = await store.load(office);
  if (!ws) { await store.createOffice(emptyWorkspace(office, officeName, [])); ws = (await store.load(office))!; }
  if (!ws.members.some((m) => m.userId === user!.id)) {
    ws.members.push({ userId: user.id, name, email, role });
    await store.save(ws, ws.version);
  }
  await store.addMembership({ userId: user.id, officeId: office, role });
  console.log(`User ${email} is a ${role} in ${office}.`);
  if (store instanceof PostgresStore) await store.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
