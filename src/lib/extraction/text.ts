import "server-only";
import { config, usesAIService } from "../config";
import { ocrImages } from "../ai/anthropic";
import type { AIUsage } from "../types";
import { transcribeDocument, type AIOptions } from "../ai/services/court-order";

export type DetectedType = "pdf" | "png" | "jpeg" | "text" | null;

/** Identify the file from its bytes, not its name or the browser's claimed type. */
export function sniff(bytes: Uint8Array): DetectedType {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, 4096));
    // eslint-disable-next-line no-control-regex
    if (!/[\x00-\x08\x0E-\x1F]/.test(s)) return "text";
  } catch {
    /* not utf-8 */
  }
  return null;
}

async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  // Legacy build runs in Node without a worker thread. Load the worker module ourselves: pdfjs otherwise
  // require()s "./pdf.worker.js" at runtime, which serverless file tracing does not bundle.
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error no type declarations for the worker entry
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.js");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
  let text = "";
  const pages = Math.min(doc.numPages, 30);
  for (let i = 1; i <= pages; i++) {
    text += `--- Page ${i} ---\n`; // lets extracted facts cite their page
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let lastY: number | null = null;
    for (const it of tc.items as { str: string; transform: number[] }[]) {
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
      text += it.str + " ";
      lastY = y;
    }
    text += "\n\n";
  }
  await doc.destroy();
  if (doc.numPages > pages) text += `[Only the first ${pages} of ${doc.numPages} pages were read.]\n`;
  return { text: text.replace(/[ ]+\n/g, "\n").trim(), pages };
}

export interface TextResult {
  text: string | null;
  source: "pdf_text" | "ocr" | "plain_text" | "none";
  note: string | null;
  usage?: AIUsage; // AI tokens spent reading a scan (Gemini)
}

const OCR_NOTE = "Text was read by OCR. Check names, numbers and dates against the original.";

export async function extractText(bytes: Uint8Array, type: DetectedType, ai?: AIOptions): Promise<TextResult> {
  if (type === "text") return { text: new TextDecoder().decode(bytes), source: "plain_text", note: null };
  const gemini = usesAIService() && ai;
  if (type === "pdf") {
    const { text } = await pdfText(bytes);
    if (text.replace(/--- Page \d+ ---|\s/g, "").length >= 40) return { text, source: "pdf_text", note: null };
    if (gemini) {
      const r = await transcribeDocument(bytes, "application/pdf", ai);
      return { text: r.text, source: "ocr", note: OCR_NOTE, usage: r.usage };
    }
    return {
      text: null,
      source: "none",
      note: config.aiProvider === "anthropic"
        ? "This PDF has no text layer (it is a scan). Upload a photo of each page so it can be read with OCR, or enter the details manually."
        : "This PDF has no text layer (it is a scan). OCR needs an AI key; enter the details manually instead.",
    };
  }
  if (type === "png" || type === "jpeg") {
    if (gemini) {
      const r = await transcribeDocument(bytes, type === "png" ? "image/png" : "image/jpeg", ai);
      return { text: r.text, source: "ocr", note: OCR_NOTE, usage: r.usage };
    }
    if (config.aiProvider !== "anthropic") return { text: null, source: "none", note: "Reading photos needs OCR, which is not configured in demo mode. Paste the order text or enter the details manually." };
    const text = await ocrImages([{ mediaType: type === "png" ? "image/png" : "image/jpeg", base64: Buffer.from(bytes).toString("base64") }]);
    return { text, source: "ocr", note: OCR_NOTE };
  }
  return { text: null, source: "none", note: "Unsupported file type." };
}
