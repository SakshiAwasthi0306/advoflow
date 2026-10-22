// Structured server-side logging: one JSON object per line, so Vercel and other log tools can filter by field.
// Secrets are masked before writing: fields whose name looks sensitive, and connection strings inside text.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|(^|_)url$|connection/i;
const SECRET_IN_TEXT = /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis):\/\/[^\s"']+/gi;

export function redact(value: unknown, depth = 0): unknown {
  if (value == null || depth > 5) return value;
  if (typeof value === "string") return value.replace(SECRET_IN_TEXT, "$1://[redacted]");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Fields).map(([k, v]) => [k, SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1)]));
  }
  return value;
}

export function createLogger(opts: { level?: Level; write?: (line: string, level: Level) => void; base?: Fields } = {}) {
  const min = RANK[opts.level ?? "info"];
  const write = opts.write ?? ((line, level) => (level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n"));
  const log = (level: Level, msg: string, fields: Fields = {}) => {
    if (RANK[level] < min) return;
    write(JSON.stringify({ level, time: new Date().toISOString(), msg, ...opts.base, ...(redact(fields) as Fields) }), level);
  };
  return {
    debug: (msg: string, fields?: Fields) => log("debug", msg, fields),
    info: (msg: string, fields?: Fields) => log("info", msg, fields),
    warn: (msg: string, fields?: Fields) => log("warn", msg, fields),
    error: (msg: string, fields?: Fields) => log("error", msg, fields),
    child: (base: Fields) => createLogger({ ...opts, base: { ...opts.base, ...base } }),
  };
}

export type Logger = ReturnType<typeof createLogger>;

const envLevel = process.env.LOG_LEVEL;
export const logger = createLogger({
  level: envLevel === "debug" || envLevel === "info" || envLevel === "warn" || envLevel === "error" ? envLevel : process.env.NODE_ENV === "development" ? "debug" : "info",
  base: { service: "advoflow" },
});
