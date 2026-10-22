import { execSync } from "node:child_process";

/** Apply the Prisma migrations to a throwaway test database (called once, from tests/global-setup.ts). */
export function migrateTestDb(url: string) {
  // Keep _prisma_migrations in "app" on test databases.
  const cli = `${url}${url.includes("?") ? "&" : "?"}schema=app`;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: cli, DATABASE_URL_UNPOOLED: cli }, stdio: "pipe" });
}
