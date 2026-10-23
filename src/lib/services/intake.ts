import "server-only";
import { config, usesAIService } from "../config";
import { aiExtract } from "../extraction/ai-extractor";
import { AIError } from "../ai/errors";
import { extractCourtOrder } from "../ai/services/court-order";
import { demoExtract } from "../extraction/demo-extractor";
import { extractText, sniff, type DetectedType, type TextResult } from "../extraction/text";
import { documents } from "../server";
import { getStore } from "../store";
import type { DocumentRecord, Extraction, ProcessingJob, Session } from "../types";
import { newId, normaliseText, nowISO, sha256 } from "../util";
import { createJob } from "./orders";
import { loadWorkspace, mutate, requireRole, ValidationError } from "./workspace";

export interface IntakeItem {
  name: string;
  bytes?: Uint8Array; // uploaded file
  text?: string; // pasted text
}

export interface IntakeResult {
  name: string;
  jobId: string | null;
  status: ProcessingJob["status"] | "error";
  reused: boolean;
  message: string;
}

export interface IntakeOptions {
  requestId: string;
  /** Absolute time (ms) by which AI work must finish (the route's own time limit, minus a margin). */
  deadlineAt: number;
  /** For the AI API: throw AIError (nothing saved) instead of recording a failed job. */
  throwAIErrors?: boolean;
}

const EXT: Record<Exclude<DetectedType, null>, { ext: string; mime: string }> = {
  pdf: { ext: "pdf", mime: "application/pdf" },
  png: { ext: "png", mime: "image/png" },
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  text: { ext: "txt", mime: "text/plain" },
};

/**
 * Accept → store original → extract text → structured extraction → review job.
 * The original is stored BEFORE any processing so it survives a failed extraction.
 */
export async function intake(session: Session, items: IntakeItem[], hint: ProcessingJob["hint"], opts?: IntakeOptions): Promise<IntakeResult[]> {
  requireRole(session, "clerk");
  const store = getStore();
  const out: IntakeResult[] = [];
  for (const item of items) {
    try {
      let bytes: Uint8Array;
      let type: DetectedType;
      if (item.text !== undefined) {
        const t = normaliseText(item.text);
        if (t.length < 20) throw new ValidationError("The pasted text is too short to be an order.");
        bytes = new TextEncoder().encode(t);
        type = "text";
      } else {
        bytes = item.bytes!;
        if (bytes.length > config.maxUploadBytes) throw new ValidationError(`File is larger than ${config.maxUploadBytes / 1024 / 1024} MB.`);
        if (bytes.length === 0) throw new ValidationError("File is empty.");
        type = sniff(bytes);
        if (!type) throw new ValidationError("Unsupported file. Use PDF, JPG, PNG or plain text.");
      }
      const sha = sha256(bytes);
      const { ext, mime } = EXT[type];

      // Same file already uploaded and still open or approved? Return that job instead of processing again.
      const existingWs = await loadWorkspace(store, session);
      const prior = existingWs.jobs.find((j) => j.idempotencyKey === sha && j.status !== "failed" && j.status !== "rejected");
      if (prior) {
        out.push({ name: item.name, jobId: prior.id, status: prior.status, reused: true, message: prior.status === "approved" ? "Already approved earlier — nothing new was created." : "Already uploaded and waiting for review." });
        continue;
      }

      const storageKey = await documents.put(session.officeId, sha, ext, bytes); // keyed by content: a retry overwrites, never duplicates
      const ai = opts ? { requestId: opts.requestId, deadlineAt: opts.deadlineAt } : undefined;
      let textRes: Omit<TextResult, "source"> & { source: TextResult["source"] | "pasted" } | undefined;
      let extraction: Extraction | null = null;
      let error: string | null = null;
      try {
        textRes = item.text !== undefined ? { text: new TextDecoder().decode(bytes), source: "pasted" as const, note: null } : await extractText(bytes, type, ai);
        error = textRes.note && !textRes.text ? textRes.note : null;
        if (textRes.text) {
          extraction =
            usesAIService() && ai
              ? await extractCourtOrder(textRes.text, hint, { ...ai, inputKind: item.text !== undefined ? "text" : "file", priorUsage: textRes.usage })
              : config.aiProvider === "anthropic"
                ? await aiExtract(textRes.text, hint, existingWs.cases.filter((c) => c.status !== "archived").map((c) => ({ number: c.number, title: c.title })))
                : demoExtract(textRes.text, hint);
          if (textRes.note) extraction.warnings.unshift(textRes.note);
        }
      } catch (e) {
        if (e instanceof AIError && opts?.throwAIErrors) throw e; // nothing has been written to the database
        textRes ??= { text: null, source: "none", note: null };
        error = `Automatic reading failed: ${e instanceof AIError ? e.message : (e as Error).message.slice(0, 200)} The document is saved; retry or enter the details manually.`;
      }
      // The same file uploaded again after a failure keeps its one document record.
      const sameDoc = existingWs.documents.find((d) => d.sha256 === sha);
      const doc: DocumentRecord = sameDoc ?? {
        id: newId("doc"), caseId: null, filename: item.name.slice(0, 120) || `Pasted order.${ext}`, mime, size: bytes.length, sha256: sha,
        storageKey, kind: "order", textExtract: textRes.text, textSource: textRes.source, isDemo: false, uploadedBy: session.userId, createdAt: nowISO(),
      };
      const res = await mutate(store, session, (ws) => createJob(ws, session, { doc, idempotencyKey: sha, hint, extraction, error }));
      out.push({
        name: item.name, jobId: res.job.id, status: res.job.status, reused: res.reused,
        message: res.job.status === "failed" ? res.job.error ?? "Could not read this document." : "Ready for your review.",
      });
    } catch (e) {
      if (e instanceof AIError && opts?.throwAIErrors) throw e;
      out.push({ name: item.name, jobId: null, status: "error", reused: false, message: e instanceof ValidationError ? e.message : `Could not process: ${(e as Error).message.slice(0, 160)}` });
    }
  }
  return out;
}
