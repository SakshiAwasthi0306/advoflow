import "server-only";
import { config } from "../config";
import { logger } from "../logger";
import type { AIUsage } from "../types";
import { AIError, type AIErrorKind } from "./errors";
import { geminiAttempt, classifyGemini } from "./gemini";
import { openRouterAttempt, classifyOpenRouter } from "./openrouter";

// The one entry point for AI calls. Provider-neutral: Gemini directly (GEMINI_API_KEY) or through OpenRouter
// (OPENROUTER_API_KEY). Server-side only. Keys are never logged or returned; prompts and document text are never
// logged — only task, model, timings, token counts and outcome codes.

export type AIPart = { text: string } | { file: { mime: "application/pdf" | "image/png" | "image/jpeg"; base64: string; filename: string } };

export interface GenerateArgs {
  task: string; // e.g. "court-order.extract"
  requestId: string;
  system: string;
  parts: AIPart[];
  /** JSON Schema for structured output; omit for plain text (transcription). */
  jsonSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  /** How much the model may think before answering. Extraction: low. Legal research: medium. */
  reasoning?: "low" | "medium" | "high";
  timeoutMs?: number;
  /** Absolute time (ms) after which no retry is started, so a request never outlives its route. */
  deadlineAt?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  usage: AIUsage;
}

/** What one provider attempt returns. "blocked"/"truncated" are decided by the adapter from finish reasons. */
export interface AttemptResult {
  text: string;
  outcome: "ok" | "blocked" | "truncated";
  inputTokens: number | null;
  outputTokens: number | null;
  thoughtsTokens: number | null;
}
export type Classified = { kind: AIErrorKind; retry: boolean; code: string };

/** The provider's own error text, for the server log only: short, and scrubbed of anything that looks like a key or an email. */
export function providerDetail(e: unknown): string | undefined {
  const m = (e as { message?: unknown })?.message;
  if (typeof m !== "string" || !m) return undefined;
  return m
    .replace(/sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s+\S+/g, "[redacted]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .slice(0, 300);
}
export type Attempt = (args: GenerateArgs & { model: string; signal: AbortSignal; timeoutMs: number }) => Promise<AttemptResult>;

const MAX_ATTEMPTS = 2; // one retry, and only for transient failures (overload, network, timeout)
export const RETRY_DELAY_MS = 1_200;

function provider(): { name: "gemini" | "openrouter"; model: string; attempt: Attempt; classify: (e: unknown) => Classified } {
  if (config.aiProvider === "gemini") return { name: "gemini", model: config.geminiModel, attempt: geminiAttempt, classify: classifyGemini };
  if (config.aiProvider === "openrouter") return { name: "openrouter", model: config.openRouterModel, attempt: openRouterAttempt, classify: classifyOpenRouter };
  throw new AIError("not_configured");
}
export const currentProvider = () => provider().name;

/** Network-level failures shared by both adapters. */
export function classifyCommon(e: unknown): Classified | null {
  if (e instanceof AIError) return { kind: e.kind, retry: false, code: e.detail || e.kind };
  const err = e as { name?: string; message?: string; code?: string; cause?: { code?: string } };
  if (err?.name === "AbortError" || err?.name === "TimeoutError" || /timed? ?out|aborted/i.test(err?.message ?? "")) return { kind: "timeout", retry: true, code: "timeout" };
  if (/fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket/i.test(`${err?.message ?? ""} ${err?.code ?? ""} ${err?.cause?.code ?? ""}`)) return { kind: "unavailable", retry: true, code: "network" };
  return null;
}

/**
 * One AI call with a per-attempt timeout and at most one retry for transient failures.
 * Nothing is written anywhere until the caller has validated the answer, so a retry can never duplicate records.
 */
export async function generate(args: GenerateArgs): Promise<GenerateResult> {
  const p = provider();
  const timeoutMs = args.timeoutMs ?? config.ai.timeoutMs;
  const started = Date.now();
  let last: Classified = { kind: "unavailable", retry: false, code: "none" };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const r = await p.attempt({ ...args, model: p.model, signal: abort.signal, timeoutMs });
      clearTimeout(timer);
      const usage: AIUsage = { inputTokens: r.inputTokens, outputTokens: r.outputTokens, thoughtsTokens: r.thoughtsTokens, attempts: attempt, ms: Date.now() - started };
      logger.info("ai.call", { task: args.task, requestId: args.requestId, provider: p.name, model: p.model, attempt, ms: Date.now() - t0, outcome: r.outcome, usageIn: r.inputTokens, usageOut: r.outputTokens, usageThinking: r.thoughtsTokens }); // "token" in a field name is redacted by the logger
      if (r.outcome === "blocked") throw new AIError("blocked");
      if (r.outcome === "truncated") throw new AIError("invalid_output", "max_tokens");
      if (!r.text.trim()) throw new AIError("invalid_output", "empty");
      return { text: r.text, model: p.model, usage };
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof AIError && (e.kind === "blocked" || e.kind === "invalid_output" || e.kind === "not_configured")) throw e;
      const c = p.classify(e);
      last = c;
      logger.warn("ai.call_failed", { task: args.task, requestId: args.requestId, provider: p.name, model: p.model, attempt, ms: Date.now() - t0, kind: c.kind, code: c.code, providerMessage: providerDetail(e) });
      const timeLeft = (args.deadlineAt ?? Infinity) - Date.now();
      if (!c.retry || attempt === MAX_ATTEMPTS || timeLeft < timeoutMs + RETRY_DELAY_MS) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new AIError(last.kind, last.code);
}

/** Parse a structured-output answer. Invalid JSON is an error, never "best effort". */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AIError("invalid_output", "not_json");
  }
}
