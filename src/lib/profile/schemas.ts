import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN } from "../auth/password";
import { DELETE_CONFIRMATION, STATE_BAR_COUNCILS } from "./constants";

// Validation for every profile and account-security request. `.strict()` rejects unknown keys, so fields such as
// email, phoneNumber, userId or emailVerified can never be changed through the general profile update.

/**
 * Indian mobile numbers ("98765 43210", "+91-98765-43210", "098765 43210") become +919876543210.
 * Other countries must be given in international form (+<country code><number>).
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, "");
  const india = s.match(/^(?:\+91|0091|91|0)?([6-9]\d{9})$/);
  if (india) return `+91${india[1]}`;
  if (/^\+[1-9]\d{7,14}$/.test(s) && !s.startsWith("+91")) return s;
  return null;
}
export const phoneSchema = z.string().max(30).transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid mobile number (10 digits for India, or +country code)." });
  return p ?? "";
});

const now = () => new Date().getFullYear();

/**
 * Optional text: omitted or blank = keep what is stored; null = clear it explicitly.
 * (A blank form field must never wipe saved information by accident.)
 */
const optText = (max: number, re?: RegExp, msg?: string) =>
  z.union([z.null(), z.string().max(max)]).optional().superRefine((v, ctx) => {
    if (typeof v === "string" && v.trim() && re && !re.test(v.trim())) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg ?? "Invalid value" });
  });

export const profilePatchSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty.").max(120).optional().or(z.literal("").transform(() => undefined)),
  barEnrolmentNo: optText(40, /^[A-Za-z0-9/().\- ]{3,40}$/, "Use the enrolment number as issued, e.g. KAR/1234/2015."),
  stateBarCouncil: z.union([z.null(), z.enum(STATE_BAR_COUNCILS), z.literal("")]).optional(),
  yearsOfPractice: z.union([z.null(), z.number().int().min(0, "Cannot be negative.").max(70, "That is more than 70 years.")]).optional(),
  practiceAreas: z.array(z.string().trim().min(2).max(60)).max(15, "Choose up to 15 areas.").optional(),
  officeAddressLine1: optText(160),
  officeAddressLine2: optText(160),
  officeCity: optText(80),
  officeState: optText(80),
  officePincode: optText(6, /^[1-9]\d{5}$/, "PIN code must be 6 digits."),
  preferredCourtIds: z.array(z.string().min(1).max(60)).max(20).optional(),
  preferredCourtLocations: z.array(z.string().trim().min(2).max(80)).max(20).optional(),
}).strict();
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export const yearsToSince = (years: number) => now() - years;
export const sinceToYears = (since: number | null) => (since === null ? null : Math.max(0, now() - since));

export const changeEmailSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(PASSWORD_MAX),
}).strict().refine((v) => v.currentPassword !== v.newPassword, { message: "The new password must be different.", path: ["newPassword"] });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(500),
  newPassword: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(PASSWORD_MAX),
}).strict();

export const deletionSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  confirmation: z.literal(DELETE_CONFIRMATION, { errorMap: () => ({ message: `Type ${DELETE_CONFIRMATION} to confirm.` }) }),
  reason: z.string().trim().max(500).optional(),
}).strict();
