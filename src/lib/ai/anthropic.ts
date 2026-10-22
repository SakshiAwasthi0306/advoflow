import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!config.anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey });
  return client;
}

type ImagePart = { mediaType: "image/png" | "image/jpeg"; base64: string };

/** One JSON-returning call. The caller validates the result with Zod. */
export async function callJSON(system: string, userText: string, images: ImagePart[] = [], maxTokens = 4000): Promise<unknown> {
  const content: Anthropic.MessageParam["content"] = [
    ...images.map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.mediaType, data: im.base64 } })),
    { type: "text" as const, text: userText },
  ];
  const res = await anthropic().messages.create({
    model: config.anthropicModel,
    max_tokens: maxTokens,
    temperature: 0,
    system,
    messages: [{ role: "user", content }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!json) throw new Error("The AI did not return JSON");
  return JSON.parse(json);
}

/** OCR through Claude vision, for scans and photos (English and Kannada). */
export async function ocrImages(images: ImagePart[]): Promise<string> {
  const content: Anthropic.MessageParam["content"] = [
    ...images.map((im) => ({ type: "image" as const, source: { type: "base64" as const, media_type: im.mediaType, data: im.base64 } })),
    { type: "text" as const, text: "Transcribe all text in these court-order pages exactly as written, in the original language (English and/or Kannada). Keep line breaks. Do not summarise, translate or add anything. If a part is unreadable, write [unreadable]." },
  ];
  const res = await anthropic().messages.create({ model: config.anthropicModel, max_tokens: 4000, temperature: 0, messages: [{ role: "user", content }] });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
