import "server-only";
import { config } from "../config";
import { hitLimit } from "../rate-limit";
import { RateLimitError } from "../http";
import { AIError } from "./errors";
import type { Session } from "../types";

// Usage limits for AI calls, shared by every server instance (app."RateLimit"). Per person per hour, per office per
// day, and for the whole site per day (open sign-up creates new offices, so only a site-wide cap bounds the bill).
// Counted before any document is sent.
export async function aiAllowance(session: Session, documents = 1) {
  for (let i = 0; i < documents; i++) {
    await hitLimit("ai-user-hour", session.userId, config.ai.userHourlyLimit, 60 * 60);
    try {
      await hitLimit("ai-office-day", session.officeId, config.ai.officeDailyLimit, 24 * 60 * 60);
      await hitLimit("ai-site-day", "all", config.ai.siteDailyLimit, 24 * 60 * 60);
    } catch (e) {
      if (e instanceof RateLimitError) throw new AIError("quota", "daily_limit"); // "AI usage limit reached; enter details by hand"
      throw e;
    }
  }
}
