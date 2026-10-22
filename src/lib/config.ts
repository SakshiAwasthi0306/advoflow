import "server-only";

// Server-side configuration. Nothing here is ever sent to the browser.
export const config = {
  authMode: (process.env.AUTH_MODE === "password" ? "password" : "demo") as "demo" | "password",
  authSecret: process.env.AUTH_SECRET || "",
  databaseUrl: process.env.DATABASE_URL || "",
  storageDir: process.env.DOCUMENT_STORAGE_DIR || ".data/uploads",
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || "",
  dataDir: process.env.ADVOFLOW_DATA_DIR || ".data",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
  researchConnector: (process.env.RESEARCH_CONNECTOR || "demo") as "demo" | "indiankanoon" | "opendata" | "none",
  indianKanoonToken: process.env.INDIAN_KANOON_API_TOKEN || "",
  maxUploadBytes: 15 * 1024 * 1024,
};

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
