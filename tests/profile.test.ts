import { describe, it, expect } from "vitest";
import { changePasswordSchema, deletionSchema, normalizePhone, profilePatchSchema, sinceToYears, yearsToSince } from "@/lib/profile/schemas";
import { profileCompletion, type CompletionInput } from "@/lib/profile/completion";
import { parseEnv } from "@/lib/env";

describe("mobile numbers", () => {
  it("normalises Indian numbers to +91 and accepts other countries in international form", () => {
    for (const raw of ["9876543210", "98765 43210", "+91 98765-43210", "0091 9876543210", "09876543210", "919876543210"]) expect(normalizePhone(raw)).toBe("+919876543210");
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
    for (const bad of ["12345", "5876543210", "+91 12345 67890", "abcd", "+0 123", "98765432101"]) expect(normalizePhone(bad)).toBeNull();
  });
});

describe("profile update validation", () => {
  it("accepts a full valid update", () => {
    const r = profilePatchSchema.safeParse({
      name: "Asha Rao", barEnrolmentNo: "KAR/1234/2015", stateBarCouncil: "Karnataka State Bar Council", yearsOfPractice: 9,
      practiceAreas: ["Civil", "Family"], officeAddressLine1: "12, Court Road", officeCity: "Mysuru", officeState: "Karnataka", officePincode: "570001",
      preferredCourtIds: ["court_ka_hc_bengaluru"], preferredCourtLocations: ["Mysuru"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects fields that need verification or are not the user's to set (no mass assignment)", () => {
    for (const k of ["email", "phoneNumber", "emailVerified", "phoneNumberVerified", "userId", "isActive", "role", "photoKey"]) {
      expect(profilePatchSchema.safeParse({ [k]: "x" }).success).toBe(false);
    }
  });

  it("rejects invalid values", () => {
    const bad = [
      { officePincode: "12345" }, { officePincode: "012345" }, { yearsOfPractice: -1 }, { yearsOfPractice: 71 }, { yearsOfPractice: 2.5 },
      { stateBarCouncil: "Bar Council of Atlantis" }, { barEnrolmentNo: "<script>" }, { practiceAreas: Array.from({ length: 16 }, (_, i) => `Area ${i}`) },
      { name: "x".repeat(121) }, { officeCity: "y".repeat(81) },
    ];
    for (const b of bad) expect(profilePatchSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });

  it("keeps blank fields and clears only on an explicit null", () => {
    const blank = profilePatchSchema.parse({ officeCity: "", stateBarCouncil: "", name: "" });
    expect(blank.name).toBeUndefined(); // service ignores undefined and blank strings
    expect(blank.officeCity).toBe("");
    expect(profilePatchSchema.parse({ officeCity: null, yearsOfPractice: null }).officeCity).toBeNull();
  });

  it("stores years of practice as a start year so it stays correct", () => {
    expect(sinceToYears(yearsToSince(9))).toBe(9);
    expect(sinceToYears(null)).toBeNull();
  });

  it("password change and deletion requests are strict", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "a long old password", newPassword: "short" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "same same same!", newPassword: "same same same!" }).success).toBe(false);
    expect(deletionSchema.safeParse({ currentPassword: "x", confirmation: "delete" }).success).toBe(false);
    expect(deletionSchema.safeParse({ currentPassword: "x", confirmation: "DELETE MY ACCOUNT" }).success).toBe(true);
  });
});

describe("profile completion", () => {
  const empty: CompletionInput = { name: "A", emailVerified: false, phoneNumberVerified: false, hasPhoto: false, barEnrolmentNo: null, stateBarCouncil: null, practiceSinceYear: null, practiceAreas: [], officeAddressLine1: null, officeCity: null, officePincode: null, preferredCourtIds: [], preferredCourtLocations: [] };
  it("counts what is missing without blocking anything", () => {
    expect(profileCompletion(empty)).toMatchObject({ percent: 0 });
    expect(profileCompletion({ ...empty, name: "Asha Rao" }).percent).toBe(10);
    const full = profileCompletion({ ...empty, name: "Asha Rao", emailVerified: true, phoneNumberVerified: true, hasPhoto: true, barEnrolmentNo: "KAR/1/2015", stateBarCouncil: "x", practiceSinceYear: 2015, practiceAreas: ["Civil"], officeAddressLine1: "1", officeCity: "Mysuru", officePincode: "570001", preferredCourtLocations: ["Mysuru"] });
    expect(full).toEqual({ percent: 100, missing: [] });
    expect(profileCompletion({ ...empty, name: "Asha Rao", officeAddressLine1: "1" }).missing.map((m) => m.key)).toContain("office"); // partial address is not complete
  });
});

describe("SMS delivery setting", () => {
  it("logs codes only in development; production has no SMS until a provider is added", () => {
    expect(parseEnv({ NODE_ENV: "development" }).smsDelivery).toBe("log");
    expect(parseEnv({ NODE_ENV: "production" }).smsDelivery).toBe("none");
    expect(parseEnv({ NODE_ENV: "production", SMS_DELIVERY: "log" }).smsDelivery).toBe("log");
  });
});
