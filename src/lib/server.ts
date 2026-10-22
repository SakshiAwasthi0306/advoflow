import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import path from "node:path";
import { config } from "./config";
import { getSession, requireSession, UnauthenticatedError } from "./session";
import { getStore } from "./store";
import { ConflictError } from "./store/types";
import { loadWorkspace, mutate, NotFoundError, PermissionError, ValidationError } from "./services/workspace";
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

/** Wraps an API route: consistent JSON errors, no stack traces or document contents in responses or logs. */
export function route<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") }, { status: 400 });
      if (e instanceof UnauthenticatedError) return NextResponse.json({ error: e.message }, { status: 401 });
      if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
      if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
      if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
      if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
      if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429 });
      console.error("[advoflow] request failed:", (e as Error).name, (e as Error).message?.slice(0, 200));
      return NextResponse.json({ error: "Something went wrong. Nothing was changed; please try again." }, { status: 500 });
    }
  };
}

// Simple in-memory rate limiter for expensive endpoints (per office). Use a shared store (e.g. Redis) when running several instances.
export class RateLimitError extends Error {}
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
