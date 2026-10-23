import "server-only";
import { config } from "../config";
import { AIError } from "./errors";
import { classifyCommon, type Attempt, type Classified } from "./client";

// Gemini (or another model) through OpenRouter's OpenAI-compatible API, used when OPENROUTER_API_KEY is set and
// GEMINI_API_KEY is not. Plain fetch, no extra SDK. One attempt per call; retries and logging live in client.ts.
//
// Privacy: every request asks OpenRouter to use only providers that do not collect data (data_collection: "deny")
// and, unless AI_ZERO_DATA_RETENTION=false, only zero-data-retention endpoints (zdr). PDFs are read by the model
// itself (file-parser engine "native"), never sent to a separate OCR service. require_parameters makes OpenRouter
// skip any provider that would ignore the JSON schema.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** OpenRouter's error codes (HTTP status or the code inside a 200 body). */
export class OpenRouterError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "OpenRouterError";
  }
}

type Content = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } | { type: "file"; file: { filename: string; file_data: string } };

export const openRouterAttempt: Attempt = async (a) => {
  if (!config.openRouterKey) throw new AIError("not_configured");
  const content: Content[] = a.parts.map((p) => {
    if ("text" in p) return { type: "text", text: p.text };
    const url = `data:${p.file.mime};base64,${p.file.base64}`;
    return p.file.mime === "application/pdf" ? { type: "file", file: { filename: p.file.filename, file_data: url } } : { type: "image_url", image_url: { url } };
  });
  const hasPdf = a.parts.some((p) => "file" in p && p.file.mime === "application/pdf");
  const body = {
    model: a.model,
    messages: [{ role: "system", content: a.system }, { role: "user", content }],
    max_tokens: a.maxOutputTokens ?? config.ai.maxOutputTokens,
    reasoning: { effort: "low" },
    ...(a.jsonSchema ? { response_format: { type: "json_schema", json_schema: { name: "court_order", strict: true, schema: a.jsonSchema } } } : {}),
    ...(hasPdf ? { plugins: [{ id: "file-parser", pdf: { engine: "native" } }] } : {}),
    provider: { data_collection: "deny", ...(config.aiZeroRetention ? { zdr: true } : {}), require_parameters: true },
    stream: false,
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    signal: a.signal,
    headers: {
      Authorization: `Bearer ${config.openRouterKey}`,
      "Content-Type": "application/json",
      ...(config.appUrl ? { "HTTP-Referer": config.appUrl } : {}),
      "X-Title": "AdvoFlow",
    },
    body: JSON.stringify(body),
  });
  let json: {
    error?: { code?: number; message?: string; metadata?: { raw?: unknown; provider_name?: string } };
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
  };
  try {
    json = await res.json();
  } catch {
    throw new OpenRouterError(res.ok ? 502 : res.status, "unreadable response");
  }
  if (!res.ok || json.error) {
    // errors can arrive inside a 200 body; the upstream provider's own reason is in metadata.raw
    const raw = json.error?.metadata?.raw;
    const reason = [json.error?.message ?? `HTTP ${res.status}`, json.error?.metadata?.provider_name, raw === undefined ? undefined : typeof raw === "string" ? raw : JSON.stringify(raw)].filter(Boolean).join(" | ");
    throw new OpenRouterError(json.error?.code ?? res.status, reason);
  }
  const choice = json.choices?.[0];
  if (!choice) throw new OpenRouterError(502, "no choices");
  const finish = choice.finish_reason;
  if (finish === "error") throw new OpenRouterError(502, "provider error during generation");
  const u = json.usage;
  return {
    text: choice.message?.content ?? "",
    outcome: finish === "content_filter" || choice.message?.refusal ? "blocked" : finish === "length" ? "truncated" : "ok",
    inputTokens: u?.prompt_tokens ?? null,
    outputTokens: u?.completion_tokens ?? null,
    thoughtsTokens: u?.completion_tokens_details?.reasoning_tokens ?? null,
  };
};

export function classifyOpenRouter(e: unknown): Classified {
  if (e instanceof OpenRouterError) {
    const s = e.status;
    if (s === 401) return { kind: "invalid_key", retry: false, code: "http_401" };
    if (s === 402) return { kind: "quota", retry: false, code: "http_402" }; // out of credits
    if (s === 429) return { kind: "quota", retry: false, code: "http_429" };
    if (s === 403) return { kind: "blocked", retry: false, code: "http_403" }; // moderation or guardrail
    if (s === 404) return { kind: "model_not_found", retry: false, code: "http_404" };
    if (s === 408) return { kind: "timeout", retry: true, code: "http_408" };
    if (s === 503) return { kind: "unavailable", retry: false, code: "http_503" }; // no provider meets the routing rules: a retry will not help
    if (s >= 500) return { kind: "unavailable", retry: true, code: `http_${s}` };
    return { kind: "bad_request", retry: false, code: `http_${s}` };
  }
  return classifyCommon(e) ?? { kind: "unavailable", retry: false, code: "unknown" };
}
