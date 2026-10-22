// Applies SQL files in db/migrations in order, once each. Usage: DATABASE_URL=... npm run db:migrate
// Prefers DATABASE_URL_UNPOOLED (Neon's direct connection): migrations should not run through the pooler.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

export async function migrate(url: string) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const dir = path.resolve(__dirname, "../db/migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const done = await c.query("SELECT 1 FROM schema_migrations WHERE name=$1", [f]);
      if (done.rowCount) continue;
      await c.query("BEGIN");
      await c.query(readFileSync(path.join(dir, f), "utf8"));
      await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [f]);
      await c.query("COMMIT");
      console.log(`applied ${f}`);
    }
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await c.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) first.");
    process.exit(1);
  }
  migrate(url).then(() => console.log("Database is up to date."), (e) => { console.error(e); process.exit(1); });
}
