import type { AppInfo } from "@/lib/health";
import pkg from "../../../../package.json";

export const appInfo: AppInfo = {
  service: "advoflow",
  version: pkg.version,
  commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
};
export const NO_STORE = { "Cache-Control": "no-store" };
