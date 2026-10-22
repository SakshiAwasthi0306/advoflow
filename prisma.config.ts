import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Prisma 7 does not read .env files itself; load them the same way Next.js does (.env.local etc.).
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  // The CLI (db pull, and migrations from Step 2 on) uses the direct, non-pooled connection when there is one.
  datasource: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "" },
});
