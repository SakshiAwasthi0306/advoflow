// Without GEMINI_API_KEY nothing breaks: AI calls fail with a clear configuration error and the rest of the app
// (rule-based extraction, everything else) keeps working. The shared public demo never uses a configured key.
import { describe, it, expect, vi, afterEach } from "vitest";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; vi.resetModules(); });

async function load(env: Record<string, string | undefined>) {
  process.env = { ...saved, ...env };
  vi.resetModules();
  const { config } = await import("@/lib/config");
  const { generate } = await import("@/lib/ai/client");
  return { config, generate };
}

describe("AI configuration", () => {
  it("no key: provider falls back to the rule-based extractor and AI calls give a clear error, without crashing", async () => {
    const { config, generate } = await load({ GEMINI_API_KEY: undefined, OPENROUTER_API_KEY: undefined, ANTHROPIC_API_KEY: undefined, AUTH_MODE: "password" });
    expect(config.aiProvider).toBe("rules");
    const e = (await generate({ task: "t", requestId: "r", system: "s", parts: [{ text: "x" }] }).catch((x: unknown) => x)) as Error & { kind: string };
    expect(e).toMatchObject({ name: "AIError", kind: "not_configured" });
    expect(e.message).toMatch(/no OPENROUTER_API_KEY or GEMINI_API_KEY/);
    const { demoExtract } = await import("@/lib/extraction/demo-extractor");
    expect(demoExtract("IN THE COURT OF THE CITY CIVIL JUDGE, BENGALURU\nO.S. No. 1/2026\nDate: 01-10-2026\nAdjourned to 15-10-2026.").nextHearingDate.value).toBe("2026-10-15");
  });
  it("the shared demo never sends documents to Gemini, even if a key is present", async () => {
    const { config } = await load({ GEMINI_API_KEY: "test-key-not-real", AUTH_MODE: "demo", AI_IN_DEMO: undefined });
    expect(config.aiProvider).toBe("rules");
  });
  it("OpenRouter is used when only OPENROUTER_API_KEY is set, with the same Gemini model by default", async () => {
    const { config } = await load({ GEMINI_API_KEY: undefined, OPENROUTER_API_KEY: "test-key-not-real", AUTH_MODE: "password", OPENROUTER_MODEL: undefined });
    expect(config.aiProvider).toBe("openrouter");
    expect(config.openRouterModel).toBe("google/gemini-3.8-flash");
    expect(config.aiZeroRetention).toBe(true);
  });
  it("sign-in deployments use Gemini when the key is set; the model is configurable and validated", async () => {
    const { config } = await load({ GEMINI_API_KEY: "test-key-not-real", AUTH_MODE: "password", GEMINI_MODEL: "gemini-3.5-flash-lite" });
    expect(config.aiProvider).toBe("gemini");
    expect(config.geminiModel).toBe("gemini-3.5-flash-lite");
    const { parseEnv } = await import("@/lib/env");
    expect(parseEnv({ GEMINI_MODEL: "gpt-4o" }).issues.map((i) => i.variable)).toContain("GEMINI_MODEL");
    expect(JSON.stringify(parseEnv({ GEMINI_API_KEY: "test-key-not-real", GEMINI_MODEL: "bad model" }).issues)).not.toContain("test-key-not-real");
  });
});
