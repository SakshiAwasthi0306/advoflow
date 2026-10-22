import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConflictError } from "./store/types";
import { NotFoundError, PermissionError, ValidationError } from "./services/workspace";
import { logger } from "./logger";

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
  | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";

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
  if (e instanceof RateLimitError) return errorJson(429, "RATE_LIMITED", e.message, requestId, e.retryAfterSeconds ? { "Retry-After": String(e.retryAfterSeconds) } : undefined);
  const err = e instanceof Error ? e : new Error(String(e));
  logger.error("request failed", { requestId, ...context, error: { name: err.name, message: err.message.slice(0, 300) } });
  return errorJson(500, "INTERNAL_ERROR", "Something went wrong. Nothing was changed; please try again.", requestId);
}
