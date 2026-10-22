import "server-only";

import { parseEnv } from "./env";
import { logger } from "./logger";

// Server-side configuration, validated by src/lib/env.ts. Nothing here is ever sent to the browser.
const env = parseEnv(process.env);

export const config = {
  appUrl: env.appUrl,
  authMode: env.authMode,
  authSecret: env.authSecret,
  databaseUrl: env.databaseUrl,
  storageDir: env.storageDir,
  blobToken: env.blobToken,
  dataDir: env.dataDir,
  anthropicKey: env.anthropicKey,
  anthropicModel: env.anthropicModel,
  researchConnector: env.researchConnector,
  indianKanoonToken: env.indianKanoonToken,
  logLevel: env.logLevel,
  allowRegistration: env.allowRegistration,
  maxUploadBytes: 15 * 1024 * 1024,
};

/** Configuration problems by variable name (never values), for the health check and startup log. */
export const configIssues = env.issues;
if (configIssues.length && process.env.NODE_ENV !== "test") {
  logger.warn("configuration problems", { issues: configIssues });
}

/** A plain summary of which integrations are live — shown in Settings so nothing is overstated. */
export function integrationStatus() {
  return {
    ai: config.anthropicKey ? { live: true, label: `Anthropic Claude (${config.anthropicModel})` } : { live: false, label: "Not configured: demo rule-based extractor in use" },
    database: config.databaseUrl ? { live: true, label: "PostgreSQL" } : { live: false, label: "Local file store in .data/ (demo only)" },
    auth: config.authMode === "password" ? { live: true, label: "Email + password, signed session cookie" } : { live: false, label: "Demo mode: single demo office, no login" },
    research:
      config.researchConnector === "indiankanoon" && config.indianKanoonToken
        ? { live: true, label: "Indian Kanoon API (experimental connector)" }
        : config.researchConnector === "opendata" && config.databaseUrl
          ? { live: true, label: "eCourts open data: Supreme Court headnotes + Karnataka HC (keyword search)" }
        : config.researchConnector === "none"
          ? { live: false, label: "No legal source connected" }
          : { live: false, label: "Demo corpus of FICTIONAL authorities" },
    ocr: config.anthropicKey ? { live: true, label: "PDF text layer + Claude vision for scans and photos" } : { live: false, label: "PDF text layer only; scans and photos need an AI key or manual entry" },
    storage: config.blobToken ? { live: true, label: "Vercel Blob (private)" } : { live: false, label: "Local private folder on this server" },
    calendar: { live: false, label: "CSV export only; no live calendar sync" },
    messaging: { live: false, label: "WhatsApp hand-off link only; nothing is sent automatically" },
  };
}
