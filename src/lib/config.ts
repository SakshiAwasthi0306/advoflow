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
  geminiKey: env.geminiKey,
  geminiModel: env.geminiModel,
  openRouterKey: env.openRouterKey,
  openRouterModel: env.openRouterModel,
  aiZeroRetention: env.aiZeroRetention,
  ai: env.ai,
  researchConnector: env.researchConnector,
  indianKanoonToken: env.indianKanoonToken,
  logLevel: env.logLevel,
  allowRegistration: env.allowRegistration,
  twoStepLogin: env.twoStepLogin,
  emailDelivery: env.emailDelivery,
  smsDelivery: env.smsDelivery,
  resendApiKey: env.resendApiKey,
  emailFrom: env.emailFrom,
  maxUploadBytes: 15 * 1024 * 1024,
  /** Which AI reads court orders here: Gemini directly, else Gemini via OpenRouter, else Anthropic, else the rule-based extractor. */
  aiProvider: (env.authMode === "demo" && !env.aiInDemo ? "rules" : env.geminiKey ? "gemini" : env.openRouterKey ? "openrouter" : env.anthropicKey ? "anthropic" : "rules") as "gemini" | "openrouter" | "anthropic" | "rules",
};

/** Providers served by the structured-extraction service in src/lib/ai (prompts, schemas, source checks). */
export const usesAIService = () => config.aiProvider === "gemini" || config.aiProvider === "openrouter";
export const aiModel = () => (config.aiProvider === "openrouter" ? config.openRouterModel : config.geminiModel);

/** Configuration problems by variable name (never values), for the health check and startup log. */
export const configIssues = env.issues;
if (configIssues.length && process.env.NODE_ENV !== "test") {
  logger.warn("configuration problems", { issues: configIssues });
}

/** A plain summary of which integrations are live — shown in Settings so nothing is overstated. */
export function integrationStatus() {
  return {
    ai:
      config.aiProvider === "gemini" ? { live: true, label: `Google Gemini (${config.geminiModel}): drafts for review, never saved without approval` }
      : config.aiProvider === "openrouter" ? { live: true, label: `${config.openRouterModel} via OpenRouter${config.aiZeroRetention ? " (zero-data-retention routing)" : ""}: drafts for review, never saved without approval` }
      : config.aiProvider === "anthropic" ? { live: true, label: `Anthropic Claude (${config.anthropicModel})` }
      : { live: false, label: config.authMode === "demo" && (config.geminiKey || config.openRouterKey || config.anthropicKey) ? "Off in the shared demo: rule-based extractor in use" : "Not configured: rule-based extractor in use (set OPENROUTER_API_KEY or GEMINI_API_KEY)" },
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
    ocr: config.aiProvider === "gemini" || config.aiProvider === "openrouter" ? { live: true, label: `PDF text layer + ${config.aiProvider === "openrouter" ? config.openRouterModel : config.geminiModel} for scans and photos` } : config.aiProvider === "anthropic" ? { live: true, label: "PDF text layer + Claude vision for scans and photos" } : { live: false, label: "PDF text layer only; scans and photos need an AI key or manual entry" },
    storage: config.blobToken ? { live: true, label: "Vercel Blob (private)" } : { live: false, label: "Local private folder on this server" },
    twoStep: config.twoStepLogin === "required" ? { live: true, label: "Required: password, then a code sent by email" } : { live: false, label: "Off: password only (TWO_STEP_LOGIN=off)" },
    email: config.emailDelivery === "resend" ? { live: true, label: "Sign-in codes sent by email (Resend)" } : { live: false, label: config.emailDelivery === "log" ? "Sign-in codes written to the server log (development only)" : "Not configured: sign-in codes cannot be sent" },
    sms: config.smsDelivery === "log" ? { live: false, label: "Mobile codes written to the server log (development only)" } : { live: false, label: "No SMS provider: mobile numbers cannot be verified yet" },
    calendar: { live: false, label: "CSV export only; no live calendar sync" },
    messaging: { live: false, label: "WhatsApp hand-off link only; nothing is sent automatically" },
  };
}
