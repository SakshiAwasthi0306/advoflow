import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import { config } from "../config";
import { AIError } from "./errors";
import { classifyCommon, type Attempt, type Classified } from "./client";

// Direct Google Gemini (official @google/genai SDK), used when GEMINI_API_KEY is set. One attempt per call;
// timeouts, retries and logging live in client.ts. SDK retries are switched off so they stay bounded and visible.

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!config.geminiKey) throw new AIError("not_configured");
  client ??= new GoogleGenAI({ apiKey: config.geminiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  return client;
}

export const geminiAttempt: Attempt = async (a) => {
  const parts: Part[] = a.parts.map((p) => ("text" in p ? { text: p.text } : { inlineData: { mimeType: p.file.mime, data: p.file.base64 } }));
  const res = await gemini().models.generateContent({
    model: a.model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: a.system,
      maxOutputTokens: a.maxOutputTokens ?? config.ai.maxOutputTokens,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      ...(a.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: a.jsonSchema } : {}),
      abortSignal: a.signal,
      httpOptions: { timeout: a.timeoutMs },
    },
  });
  const finish = res.candidates?.[0]?.finishReason as string | undefined;
  const u = res.usageMetadata;
  return {
    text: res.text ?? "",
    outcome: res.promptFeedback?.blockReason || finish === "SAFETY" || finish === "RECITATION" || finish === "PROHIBITED_CONTENT" ? "blocked" : finish === "MAX_TOKENS" ? "truncated" : "ok",
    inputTokens: u?.promptTokenCount ?? null,
    outputTokens: u?.candidatesTokenCount ?? null,
    thoughtsTokens: u?.thoughtsTokenCount ?? null,
  };
};

export function classifyGemini(e: unknown): Classified {
  if (e instanceof ApiError) {
    const msg = e.message.toLowerCase();
    if (e.status === 429) return { kind: "quota", retry: false, code: "http_429" }; // quota or per-minute limit: do not hammer
    if (e.status === 401 || e.status === 403 || (e.status === 400 && /api key|api_key|permission/.test(msg))) return { kind: "invalid_key", retry: false, code: `http_${e.status}` };
    if (e.status === 404) return { kind: "model_not_found", retry: false, code: "http_404" };
    if (e.status === 408 || e.status === 504) return { kind: "timeout", retry: true, code: `http_${e.status}` };
    if (e.status >= 500) return { kind: "unavailable", retry: true, code: `http_${e.status}` };
    return { kind: "bad_request", retry: false, code: `http_${e.status}` };
  }
  return classifyCommon(e) ?? { kind: "unavailable", retry: false, code: "unknown" };
}
