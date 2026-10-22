import { migrateTestDb } from "./pg-helpers";

// Apply the Prisma migrations ONCE before any test file runs (parallel `migrate deploy` calls race on CREATE SCHEMA).
export default function setup() {
  if (process.env.PG_TEST_URL) migrateTestDb(process.env.PG_TEST_URL);
}
