import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Prisma 7 does not read .env files itself; load them the same way Next.js does (.env.local etc.).
loadEnvConfig(process.cwd());

function withAppSchema(url: string) {
  if (!url || /[?&]schema=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}schema=app`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // The CLI (migrations) uses the direct, non-pooled connection when there is one. `schema=app` keeps Prisma's
  // _prisma_migrations history table in the "app" schema with the tables it manages; "public" holds the shared
  // judgments table (and, until they are dropped, the pre-Step-3 tables), which Prisma must not treat as its own.
  datasource: { url: withAppSchema(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "") },
});
