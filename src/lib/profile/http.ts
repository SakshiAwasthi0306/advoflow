import "server-only";
import { APIError } from "better-auth/api";
import { getAuth } from "../auth/better-auth";
import { ValidationError } from "../services/workspace";

/** The current session's token (to tell "this device" from others). Never sent to the client. */
export async function currentSessionToken(headers: Headers) {
  const s = await getAuth().api.getSession({ headers }).catch(() => null);
  return s?.session.token;
}

/** Re-check the signed-in person's password before sensitive changes (email, deletion). */
export async function confirmPassword(headers: Headers, password: string) {
  try {
    await getAuth().api.verifyPassword({ body: { password }, headers });
  } catch (e) {
    if (e instanceof APIError) throw new ValidationError("Your current password is not correct.");
    throw e;
  }
}
