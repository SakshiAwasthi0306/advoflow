// Profile completeness: informational only. Nothing in the app is blocked by an incomplete profile.

export interface CompletionInput {
  name: string;
  emailVerified: boolean;
  phoneNumberVerified: boolean;
  hasPhoto: boolean;
  barEnrolmentNo: string | null;
  stateBarCouncil: string | null;
  practiceSinceYear: number | null;
  practiceAreas: string[];
  officeAddressLine1: string | null;
  officeCity: string | null;
  officePincode: string | null;
  preferredCourtIds: string[];
  preferredCourtLocations: string[];
}

const ITEMS: { key: string; label: string; done: (p: CompletionInput) => boolean }[] = [
  { key: "name", label: "Full name", done: (p) => p.name.trim().length > 1 },
  { key: "email", label: "Verified email address", done: (p) => p.emailVerified },
  { key: "phone", label: "Verified mobile number", done: (p) => p.phoneNumberVerified },
  { key: "photo", label: "Profile photo", done: (p) => p.hasPhoto },
  { key: "enrolment", label: "Bar Council enrolment number", done: (p) => !!p.barEnrolmentNo },
  { key: "stateBar", label: "State Bar Council", done: (p) => !!p.stateBarCouncil },
  { key: "years", label: "Years of practice", done: (p) => p.practiceSinceYear !== null },
  { key: "areas", label: "Areas of practice", done: (p) => p.practiceAreas.length > 0 },
  { key: "office", label: "Office / chamber address", done: (p) => !!(p.officeAddressLine1 && p.officeCity && p.officePincode) },
  { key: "courts", label: "Preferred courts", done: (p) => p.preferredCourtIds.length + p.preferredCourtLocations.length > 0 },
];

export function profileCompletion(p: CompletionInput) {
  const missing = ITEMS.filter((i) => !i.done(p));
  return { percent: Math.round(((ITEMS.length - missing.length) / ITEMS.length) * 100), missing: missing.map(({ key, label }) => ({ key, label })) };
}
