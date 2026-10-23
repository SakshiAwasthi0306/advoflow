import "server-only";
import { config } from "../config";
import { hitLimit } from "../rate-limit";
import type { Session } from "../types";

// Usage limits for AI calls, shared by every server instance (app."RateLimit"). Per person per hour, and per
// office per day, so one account cannot run up the provider bill. Counted before any document is sent.
export async function aiAllowance(session: Session, documents = 1) {
  for (let i = 0; i < documents; i++) {
    await hitLimit("ai-user-hour", session.userId, config.ai.userHourlyLimit, 60 * 60);
    await hitLimit("ai-office-day", session.officeId, config.ai.officeDailyLimit, 24 * 60 * 60);
  }
}
