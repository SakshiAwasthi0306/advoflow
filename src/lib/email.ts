import "server-only";
import { config } from "./config";
import { logger } from "./logger";
import { limitKey } from "./rate-limit";

// Outgoing email. Only sign-in codes for now.
//   "resend": Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email); key and sender from env.
//   "log":    development / automated tests only. The code is written to the server log, tagged with a hash of the
//             address (never the address itself). Reported as "not live" in Settings and /api/health.
//   "none":   production without a provider: refuse loudly instead of pretending a code was sent.

export class EmailNotConfiguredError extends Error {}

export async function sendSignInCode(to: { email: string; name: string }, code: string): Promise<void> {
  if (config.emailDelivery === "log") {
    logger.warn("auth.login_code (EMAIL_DELIVERY=log, development only)", { to: limitKey("otp", to.email), code });
    return;
  }
  if (config.emailDelivery !== "resend" || !config.resendApiKey || !config.emailFrom) throw new EmailNotConfiguredError("Email is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [to.email],
      subject: `${code} is your AdvoFlow sign-in code`,
      text: `Your AdvoFlow sign-in code is ${code}.\n\nIt expires in 5 minutes. If you did not try to sign in, someone may know your password: change it and tell your office administrator.\n\nDo not share this code with anyone.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    logger.error("email.send_failed", { status: res.status, to: limitKey("otp", to.email) });
    throw new Error("The sign-in code could not be sent");
  }
}

/** "asha.rao@example.com" -> "as•••@example.com": enough to recognise, not enough to harvest. */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(3, user.length - 2)))}@${domain}`;
}
