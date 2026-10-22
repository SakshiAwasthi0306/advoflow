import "server-only";
import { config } from "./config";
import { logger } from "./logger";
import { limitKey } from "./rate-limit";

// Outgoing SMS (mobile-number verification codes). No SMS provider is integrated yet.
//   "log":  development / automated tests only — the code goes to the server log, tagged with a hash of the number.
//   "none": refuse, so nobody is told a code was sent when it was not. (Production default until a provider is added.)

export class SmsNotConfiguredError extends Error {}

export async function sendSms(phoneNumber: string, text: string, code: string): Promise<void> {
  if (config.smsDelivery === "log") {
    logger.warn("sms.code (SMS_DELIVERY=log, development only)", { to: limitKey("sms", phoneNumber), code, chars: text.length });
    return;
  }
  throw new SmsNotConfiguredError("SMS is not configured");
}
