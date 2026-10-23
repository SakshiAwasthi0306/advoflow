// AI failures with messages that are safe to show a user. Provider details (status bodies, keys, prompts) stay in
// the server log as a short code only; they never reach the browser.

export type AIErrorKind =
  | "not_configured" // no key on this deployment
  | "invalid_key" // key rejected or lacks permission
  | "model_not_found" // GEMINI_MODEL is not available to this key
  | "quota" // quota or provider rate limit reached
  | "timeout" // no answer in time (after bounded retries)
  | "unavailable" // provider overloaded or unreachable (after bounded retries)
  | "blocked" // the provider refused the content
  | "invalid_output" // answer was not valid JSON for the schema, or was cut off
  | "bad_request"; // the request was refused as malformed or too large

const MESSAGES: Record<AIErrorKind, string> = {
  not_configured: "AI extraction is not set up on this server (no OPENROUTER_API_KEY or GEMINI_API_KEY). You can still enter order details manually.",
  invalid_key: "The AI service rejected this server's credentials. Ask your administrator to check the AI API key.",
  model_not_found: "The configured AI model is not available. Ask your administrator to check OPENROUTER_MODEL / GEMINI_MODEL.",
  quota: "The AI usage limit has been reached for now. Try again later, or enter the details manually.",
  timeout: "The AI service took too long to answer. Nothing was saved; please try again.",
  unavailable: "The AI service is temporarily unavailable. Nothing was saved; please try again shortly.",
  blocked: "The AI service declined to process this document. Enter the details manually.",
  invalid_output: "The AI answer could not be used safely, so it was discarded. Nothing was saved; try again or enter the details manually.",
  bad_request: "The AI service could not process this document (it may be too large or unreadable). Enter the details manually.",
};

export const AI_ERROR_STATUS: Record<AIErrorKind, { status: number; code: string }> = {
  not_configured: { status: 503, code: "AI_NOT_CONFIGURED" },
  invalid_key: { status: 503, code: "AI_UNAVAILABLE" },
  model_not_found: { status: 503, code: "AI_UNAVAILABLE" },
  quota: { status: 429, code: "AI_QUOTA_EXCEEDED" },
  timeout: { status: 504, code: "AI_TIMEOUT" },
  unavailable: { status: 503, code: "AI_UNAVAILABLE" },
  blocked: { status: 422, code: "AI_BLOCKED" },
  invalid_output: { status: 502, code: "AI_INVALID_OUTPUT" },
  bad_request: { status: 422, code: "AI_BAD_REQUEST" },
};

export class AIError extends Error {
  constructor(readonly kind: AIErrorKind, readonly detail = "") {
    super(MESSAGES[kind]);
    this.name = "AIError";
  }
}

/** Confirming would change protected facts (a confirmed hearing date, the court or CNR) that the reviewer has not acknowledged. */
export class UnacknowledgedDifferences extends Error {
  constructor(readonly differences: { field: string; current: string; proposed: string; protected: boolean; note: string }[]) {
    super("This draft conflicts with the case record. Review the differences and confirm again, listing them in acknowledgeDifferences.");
    this.name = "UnacknowledgedDifferences";
  }
}
