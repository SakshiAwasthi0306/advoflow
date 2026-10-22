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

/** Emails that carry a link (address change, password reset). In "log" mode the link goes to the server log. */
export async function sendLinkEmail(to: string, kind: "verify-email" | "confirm-email-change" | "reset-password", link: string): Promise<void> {
  const subjects = { "verify-email": "Confirm your new AdvoFlow email address", "confirm-email-change": "Confirm the change of your AdvoFlow email address", "reset-password": "Reset your AdvoFlow password" };
  const bodies = {
    "verify-email": `Open this link to confirm this address for your AdvoFlow account:\n\n${link}\n\nThe link expires in 1 hour. Until you open it, your old address stays in use.`,
    "confirm-email-change": `Someone (hopefully you) asked to change your AdvoFlow sign-in email. Open this link to approve; we will then ask the new address to confirm too:\n\n${link}\n\nIf this was not you, ignore this email and change your password.`,
    "reset-password": `Open this link to choose a new AdvoFlow password:\n\n${link}\n\nThe link works once and expires in 30 minutes. Resetting signs you out everywhere. If you did not ask for this, ignore this email.`,
  };
  if (config.emailDelivery === "log") {
    logger.warn("auth.email_link (EMAIL_DELIVERY=log, development only)", { kind, to: limitKey("otp", to), link });
    return;
  }
  if (config.emailDelivery !== "resend" || !config.resendApiKey || !config.emailFrom) throw new EmailNotConfiguredError("Email is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.emailFrom, to: [to], subject: subjects[kind], text: bodies[kind] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    logger.error("email.send_failed", { status: res.status, kind, to: limitKey("otp", to) });
    throw new Error("The email could not be sent");
  }
}

/** "asha.rao@example.com" -> "as•••@example.com": enough to recognise, not enough to harvest. */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(3, user.length - 2)))}@${domain}`;
}
