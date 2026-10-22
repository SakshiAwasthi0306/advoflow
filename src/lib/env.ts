import { z } from "zod";

// Environment variables, validated once at startup. Nothing here is sent to the browser, and problems are
// reported by variable NAME only — values (URLs, keys, passwords) never appear in messages or logs.

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess(blank, t.optional());
const postgresUrl = z.string().refine((s) => /^postgres(ql)?:\/\//.test(s), "must be a postgres:// or postgresql:// URL");

const schema = z.object({
  NODE_ENV: opt(z.enum(["development", "production", "test"])),
  APP_URL: opt(z.string().url("must be a full URL such as https://advoflow.example.com")),
  AUTH_MODE: opt(z.string()),
  AUTH_SECRET: opt(z.string()),
  DATABASE_URL: opt(postgresUrl),
  DATABASE_URL_UNPOOLED: opt(postgresUrl),
  DOCUMENT_STORAGE_DIR: opt(z.string()),
  ADVOFLOW_DATA_DIR: opt(z.string()),
  BLOB_READ_WRITE_TOKEN: opt(z.string()),
  ANTHROPIC_API_KEY: opt(z.string()),
  ANTHROPIC_MODEL: opt(z.string()),
  RESEARCH_CONNECTOR: opt(z.enum(["demo", "opendata", "indiankanoon", "none"])),
  INDIAN_KANOON_API_TOKEN: opt(z.string()),
  LOG_LEVEL: opt(z.enum(["debug", "info", "warn", "error"])),
  ALLOW_REGISTRATION: opt(z.enum(["true", "false"])),
  EMAIL_DELIVERY: opt(z.enum(["resend", "log"])),
  TWO_STEP_LOGIN: opt(z.enum(["required", "off"])),
  RESEND_API_KEY: opt(z.string()),
  EMAIL_FROM: opt(z.string()),
  VERCEL: opt(z.string()),
});

export interface EnvIssue {
  variable: string;
  message: string;
}

export interface Env {
  appUrl: string | null;
  authMode: "demo" | "password";
  authSecret: string;
  databaseUrl: string;
  databaseUrlUnpooled: string;
  storageDir: string;
  dataDir: string;
  blobToken: string;
  anthropicKey: string;
  anthropicModel: string;
  researchConnector: "demo" | "indiankanoon" | "opendata" | "none";
  indianKanoonToken: string;
  logLevel: "debug" | "info" | "warn" | "error";
  allowRegistration: boolean;
  /** Password mode: "required" (default) = emailed code after the password; "off" = password only. */
  twoStepLogin: "required" | "off";
  /** How sign-in codes reach people: "resend" (real email), "log" (server log; development/testing only), "none". */
  emailDelivery: "resend" | "log" | "none";
  resendApiKey: string;
  emailFrom: string;
  onVercel: boolean;
  issues: EnvIssue[];
}

/** Parse and cross-check configuration. Never throws: invalid settings fall back safely and are listed in `issues`. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const issues: EnvIssue[] = [];
  const r = schema.safeParse(source);
  const raw: Partial<z.infer<typeof schema>> = {};
  if (r.success) Object.assign(raw, r.data);
  else {
    // Keep every valid variable; drop the invalid ones and say which.
    const bad = new Set(r.error.issues.map((i) => String(i.path[0])));
    // Zod's own enum message repeats the value it received; describe the allowed values instead.
    for (const i of r.error.issues) issues.push({ variable: String(i.path[0]), message: i.code === "invalid_enum_value" ? `must be one of: ${i.options.join(", ")}` : i.message });
    const partial = schema.partial().safeParse(Object.fromEntries(Object.entries(source).filter(([k]) => !bad.has(k))));
    if (partial.success) Object.assign(raw, partial.data);
  }

  // Fail closed: anything other than an explicit "demo" (or unset) means sign-in is required.
  const mode = raw.AUTH_MODE?.trim().toLowerCase();
  const authMode = !mode || mode === "demo" ? "demo" : "password";
  if (mode && mode !== "demo" && mode !== "password") issues.push({ variable: "AUTH_MODE", message: 'must be "demo" or "password"; treated as "password" so data is not exposed' });
  if (authMode === "password" && (raw.AUTH_SECRET ?? "").length < 32) issues.push({ variable: "AUTH_SECRET", message: "is required in password mode and must be at least 32 characters; nobody can sign in until it is set" });
  if (authMode === "password" && !raw.DATABASE_URL) issues.push({ variable: "DATABASE_URL", message: "is required in password mode (accounts and sessions are stored in PostgreSQL); nobody can sign in until it is set" });
  if (raw.ALLOW_REGISTRATION === "true" && authMode !== "password") issues.push({ variable: "ALLOW_REGISTRATION", message: "only applies in password mode" });

  // Sign-in codes: real email when a Resend key is set; otherwise the server log, but only in development or when
  // EMAIL_DELIVERY=log is chosen explicitly (e.g. automated tests). In production with neither, nobody can finish signing in.
  const emailDelivery: Env["emailDelivery"] =
    raw.EMAIL_DELIVERY ?? (raw.RESEND_API_KEY ? "resend" : raw.NODE_ENV === "production" ? "none" : "log");
  const twoStepLogin = raw.TWO_STEP_LOGIN ?? "required";
  if (authMode === "password" && twoStepLogin === "required") {
    if (emailDelivery === "resend" && !raw.RESEND_API_KEY) issues.push({ variable: "RESEND_API_KEY", message: 'is required when EMAIL_DELIVERY is "resend"' });
    if (emailDelivery === "resend" && !raw.EMAIL_FROM) issues.push({ variable: "EMAIL_FROM", message: 'is required to send sign-in codes, e.g. "AdvoFlow <signin@yourdomain.in>" (a domain verified in Resend)' });
    if (emailDelivery === "none") issues.push({ variable: "RESEND_API_KEY", message: "is not set, so sign-in codes cannot be emailed and nobody can finish signing in" });
    if (emailDelivery === "log" && raw.NODE_ENV === "production") issues.push({ variable: "EMAIL_DELIVERY", message: '"log" writes sign-in codes to the server log: for testing only, never for real users' });
  }

  const onVercel = !!raw.VERCEL;
  if (onVercel && !raw.DATABASE_URL) issues.push({ variable: "DATABASE_URL", message: "is required on Vercel: the local file store does not persist on serverless hosting" });

  const researchConnector = raw.RESEARCH_CONNECTOR ?? "demo";
  if (researchConnector === "opendata" && !raw.DATABASE_URL) issues.push({ variable: "RESEARCH_CONNECTOR", message: '"opendata" needs DATABASE_URL (the judgments are stored in PostgreSQL)' });
  if (researchConnector === "indiankanoon" && !raw.INDIAN_KANOON_API_TOKEN) issues.push({ variable: "INDIAN_KANOON_API_TOKEN", message: 'is required when RESEARCH_CONNECTOR is "indiankanoon"' });

  return {
    appUrl: raw.APP_URL ?? null,
    authMode,
    authSecret: raw.AUTH_SECRET ?? "",
    databaseUrl: raw.DATABASE_URL ?? "",
    databaseUrlUnpooled: raw.DATABASE_URL_UNPOOLED ?? "",
    storageDir: raw.DOCUMENT_STORAGE_DIR ?? ".data/uploads",
    dataDir: raw.ADVOFLOW_DATA_DIR ?? ".data",
    blobToken: raw.BLOB_READ_WRITE_TOKEN ?? "",
    anthropicKey: raw.ANTHROPIC_API_KEY ?? "",
    anthropicModel: raw.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
    researchConnector,
    indianKanoonToken: raw.INDIAN_KANOON_API_TOKEN ?? "",
    logLevel: raw.LOG_LEVEL ?? (raw.NODE_ENV === "development" ? "debug" : "info"),
    allowRegistration: raw.ALLOW_REGISTRATION === "true",
    twoStepLogin,
    emailDelivery,
    resendApiKey: raw.RESEND_API_KEY ?? "",
    emailFrom: raw.EMAIL_FROM ?? "",
    onVercel,
    issues,
  };
}
