import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import path from "node:path";
import { config } from "./config";
import { getSession, requireSession } from "./session";
import { errorResponse, newRequestId, RateLimitError } from "./http";
import { getStore } from "./store";
import { loadWorkspace, mutate } from "./services/workspace";
import { BlobDocumentStorage, LocalDocumentStorage, type DocumentStorage } from "./storage";
import type { Session, Workspace } from "./types";

export const documents: DocumentStorage = config.blobToken ? new BlobDocumentStorage() : new LocalDocumentStorage(path.resolve(config.storageDir));

/** For server components: the signed-in office's workspace, or a redirect to sign in. */
export async function pageData(): Promise<{ session: Session; ws: Workspace }> {
  const session = getSession();
  if (!session) redirect("/login");
  return { session, ws: await loadWorkspace(getStore(), session) };
}

export function withWorkspace<T>(fn: (ws: Workspace, session: Session) => T | Promise<T>) {
  const session = requireSession();
  return mutate(getStore(), session, (ws) => fn(ws, session));
}

/** Wraps an API route: consistent JSON errors (see src/lib/http.ts), no stack traces or document contents in responses or logs. */
export function route<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    const requestId = newRequestId();
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e, requestId, { method: req.method, path: new URL(req.url).pathname });
    }
  };
}

// Simple in-memory rate limiter for expensive endpoints (per office). Use a shared store (e.g. Redis) when running several instances.
export { RateLimitError };
const buckets = new Map<string, { tokens: number; at: number }>();
export function rateLimit(key: string, perMinute: number) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
  b.at = now;
  if (b.tokens < 1) throw new RateLimitError("Too many requests. Please wait a minute and try again.");
  b.tokens -= 1;
  buckets.set(key, b);
}
