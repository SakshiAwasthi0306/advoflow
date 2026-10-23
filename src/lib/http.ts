import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConflictError } from "./store/types";
import { NotFoundError, PermissionError, ValidationError } from "./services/workspace";
import { logger } from "./logger";
import { AI_ERROR_STATUS, AIError, UnacknowledgedDifferences } from "./ai/errors";

// One JSON shape for every API error:
//   { "error": "<message safe to show a user>", "code": "<MACHINE_CODE>", "requestId": "<id also written to the server log>" }
// Stack traces, SQL, file paths and document contents are never included.

export class UnauthenticatedError extends Error {
  status = 401;
}
export class RateLimitError extends Error {
  constructor(message: string, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

export type ErrorCode =
  | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR"
  | "AI_NOT_CONFIGURED" | "AI_UNAVAILABLE" | "AI_QUOTA_EXCEEDED" | "AI_TIMEOUT" | "AI_BLOCKED" | "AI_INVALID_OUTPUT" | "AI_BAD_REQUEST";

export interface ErrorBody {
  error: string;
  code: ErrorCode;
  requestId: string;
}

export const newRequestId = () => randomUUID();

export function errorJson(status: number, code: ErrorCode, message: string, requestId: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: message, code, requestId } satisfies ErrorBody, { status, headers: { "x-request-id": requestId, "Cache-Control": "no-store", ...headers } });
}

/** Map a thrown error to a safe response. Unknown errors are logged (name + redacted message) and returned as a generic 500. */
export function errorResponse(e: unknown, requestId: string, context: Record<string, unknown> = {}) {
  if (e instanceof ZodError) return errorJson(400, "VALIDATION_ERROR", e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "), requestId);
  if (e instanceof UnauthenticatedError) return errorJson(401, "UNAUTHENTICATED", e.message, requestId);
  if (e instanceof PermissionError) return errorJson(403, "FORBIDDEN", e.message, requestId);
  if (e instanceof NotFoundError) return errorJson(404, "NOT_FOUND", e.message, requestId);
  if (e instanceof ValidationError) return errorJson(400, "VALIDATION_ERROR", e.message, requestId);
  if (e instanceof ConflictError) return errorJson(409, "CONFLICT", e.message, requestId);
  if (e instanceof AIError) {
    // The user sees a plain message; the provider's details stay in the log as a short code.
    logger.warn("ai.request_failed", { requestId, ...context, kind: e.kind, code: e.detail });
    const m = AI_ERROR_STATUS[e.kind];
    return errorJson(m.status, m.code as ErrorCode, e.message, requestId);
  }
  if (e instanceof UnacknowledgedDifferences) {
    return NextResponse.json({ error: e.message, code: "CONFLICT", requestId, differences: e.differences }, { status: 409, headers: { "x-request-id": requestId, "Cache-Control": "no-store" } });
  }
  if (e instanceof RateLimitError) return errorJson(429, "RATE_LIMITED", e.message, requestId, e.retryAfterSeconds ? { "Retry-After": String(e.retryAfterSeconds) } : undefined);
  const err = e instanceof Error ? e : new Error(String(e));
  logger.error("request failed", { requestId, ...context, error: { name: err.name, message: err.message.slice(0, 300) } });
  return errorJson(500, "INTERNAL_ERROR", "Something went wrong. Nothing was changed; please try again.", requestId);
}
