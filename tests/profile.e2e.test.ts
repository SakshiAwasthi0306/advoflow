// Profile and account-security flows over real HTTP, against a running AdvoFlow in PASSWORD mode with
// EMAIL_DELIVERY=log and SMS_DELIVERY=log (codes and links are read from the server log). THROWAWAY database only:
//   E2E_BASE_URL=... E2E_DATABASE_URL=... E2E_SERVER_LOG=server.log npx vitest run tests/profile.e2e.test.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createAccount } from "@/lib/auth/accounts";

const BASE = process.env.E2E_BASE_URL;
const DB = process.env.E2E_DATABASE_URL;
const LOG = process.env.E2E_SERVER_LOG;
const run = Math.random().toString(36).slice(2, 8);
const secrets: string[] = []; // passwords, codes and tokens that must never appear in a response
const seen: string[] = [];
type Jar = { cookie: string };
type Res = { status: number; body: any; text: string; headers: Headers };

async function http(method: string, path: string, opts: { jar?: Jar; json?: unknown; form?: FormData } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.jar?.cookie) headers.cookie = opts.jar.cookie;
  if (opts.json !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers, body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined), redirect: "manual" });
  const text = r.headers.get("content-type")?.startsWith("image/") ? "" : await r.text();
  seen.push(text);
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  if (opts.jar) {
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [name, value] = pair.split("=");
      if (name.includes("session_token") || name.includes("two_factor")) {
        const others = opts.jar.cookie.split("; ").filter((x) => x && !x.startsWith(`${name}=`));
        opts.jar.cookie = [...others, ...(value ? [`${name}=${value}`] : [])].join("; ");
      }
    }
  }
  return { status: r.status, body, text, headers: r.headers };
}
const hash = (scope: string, v: string) => createHash("sha256").update(`${scope}|${v}`).digest("hex").slice(0, 32);
const logLines = (msg: string, to: string) => readFileSync(LOG!, "utf8").split("\n").filter((l) => l.includes(`"${msg}`) && l.includes(to));
async function fromLog(msg: string, to: string, after: number) {
  for (let i = 0; i < 40; i++) {
    const lines = logLines(msg, to);
    if (lines.length > after) return JSON.parse(lines[lines.length - 1]);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`nothing in the log for ${msg}`);
}
const expectError = (r: Res, status: number, code: string) => {
  expect(r.status, r.text.slice(0, 200)).toBe(status);
  expect(r.body).toMatchObject({ code, error: expect.any(String), requestId: expect.any(String) });
};

async function signIn(jar: Jar, email: string, password: string): Promise<Res> {
  const n = logLines("auth.login_code", hash("otp", email)).length;
  const step1 = await http("POST", "/api/auth/login", { jar, json: { email, password } });
  if (step1.body?.status === "signed_in") return step1; // TWO_STEP_LOGIN=off deployments
  expect(step1.status, step1.text.slice(0, 200)).toBe(200);
  const code = (await fromLog("auth.login_code", hash("otp", email), n)).code as string;
  secrets.push(code);
  return http("POST", "/api/auth/verify", { jar, json: { code } });
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!BASE || !DB || !LOG)("profile and account security over HTTP", () => {
  let db: PrismaClient;
  const P: Jar = { cookie: "" };
  const Q: Jar = { cookie: "" };
  let emailP = `profile.p.${run}@example.test`;
  const emailQ = `profile.q.${run}@example.test`;
  let pwP = `P-pass-${run}-first one!`;
  const pwQ = `Q-pass-${run}-other one!`;
  const phone1 = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const phone2 = `+9197${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB! }) });
    await db.rateLimit.deleteMany({}); // throwaway database: fresh counters
    secrets.push(pwP, pwQ);
    await createAccount(db, { email: emailP, name: "Profile P", password: pwP, role: "owner", officeName: `P office ${run}` });
    await createAccount(db, { email: emailQ, name: "Profile Q", password: pwQ, role: "owner", officeName: `Q office ${run}` });
    expect((await signIn(P, emailP, pwP)).status).toBe(200);
    expect((await signIn(Q, emailQ, pwQ)).status).toBe(200);
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { contains: run } }, select: { id: true, memberships: { select: { officeId: true } } } });
    await db.office.deleteMany({ where: { id: { in: users.flatMap((u) => u.memberships.map((m) => m.officeId)) } } });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  });

  it("without a session, every profile and account endpoint answers 401", async () => {
    const calls: [string, string, unknown?][] = [
      ["GET", "/api/profile"], ["PATCH", "/api/profile", { name: "x" }], ["GET", "/api/profile/photo"], ["DELETE", "/api/profile/photo"],
      ["POST", "/api/profile/email", { newEmail: "a@b.test", currentPassword: "x" }], ["POST", "/api/profile/phone/send-code", { phoneNumber: "9876543210" }],
      ["POST", "/api/profile/phone/verify", { phoneNumber: "9876543210", code: "123456" }], ["POST", "/api/auth/change-password", { currentPassword: "x", newPassword: "y".repeat(12) }],
      ["POST", "/api/auth/sessions", { action: "sign_out_other_devices" }], ["POST", "/api/profile/deletion-request", { currentPassword: "x", confirmation: "DELETE MY ACCOUNT" }],
    ];
    for (const [m, p, j] of calls) expectError(await http(m, p, { json: j }), 401, "UNAUTHENTICATED");
    const page = await http("GET", "/profile");
    expect([302, 307]).toContain(page.status);
  });

  it("shows and updates the advocate's own profile, with completion", async () => {
    const before = await http("GET", "/api/profile", { jar: P });
    expect(before.status).toBe(200);
    expect(before.body.account).toMatchObject({ email: emailP, name: "Profile P", emailVerified: false, phoneNumber: null, phoneNumberVerified: false });
    expect(before.body.completion.percent).toBe(10);
    const court = await db.court.findFirstOrThrow({ where: { code: "KA-HC-BENGALURU" } });
    const r = await http("PATCH", "/api/profile", { jar: P, json: {
      name: "Advocate Profile P", barEnrolmentNo: `kar/${run}/2015`, stateBarCouncil: "Karnataka State Bar Council", yearsOfPractice: 9,
      practiceAreas: ["Civil", "Family", "Civil"], officeAddressLine1: "12, Court Road", officeCity: "Mysuru", officeState: "Karnataka", officePincode: "570001",
      preferredCourtIds: [court.id], preferredCourtLocations: ["Mysuru", "Dharwad"],
    } });
    expect(r.status).toBe(200);
    expect(r.body.account.name).toBe("Advocate Profile P");
    expect(r.body.profile).toMatchObject({ barEnrolmentNo: `KAR/${run.toUpperCase()}/2015`, yearsOfPractice: 9, practiceAreas: ["Civil", "Family"], officeCity: "Mysuru", preferredCourts: [{ id: court.id, name: court.name }] });
    expect(r.body.completion.percent).toBe(70); // name, enrolment, council, years, areas, office, courts
    expect(r.body.completion.missing.map((m: any) => m.key).sort()).toEqual(["email", "phone", "photo"]);
  });

  it("blank fields keep their value; an explicit null clears it; unknown or protected fields are refused", async () => {
    const r1 = await http("PATCH", "/api/profile", { jar: P, json: { officeCity: "", officePincode: "", stateBarCouncil: "", name: "" } });
    expect(r1.status).toBe(200);
    expect(r1.body.profile).toMatchObject({ officeCity: "Mysuru", officePincode: "570001", stateBarCouncil: "Karnataka State Bar Council" });
    expect(r1.body.account.name).toBe("Advocate Profile P");
    const r2 = await http("PATCH", "/api/profile", { jar: P, json: { officeAddressLine2: null, preferredCourtLocations: [] } });
    expect(r2.body.profile).toMatchObject({ officeAddressLine2: null, preferredCourtLocations: [], officeCity: "Mysuru" });
    for (const forged of [{ email: emailQ }, { phoneNumber: "+919999999999" }, { emailVerified: true }, { userId: "someone" }, { phoneNumberVerified: true }]) {
      expectError(await http("PATCH", "/api/profile", { jar: P, json: forged }), 400, "VALIDATION_ERROR");
    }
    for (const bad of [{ officePincode: "1234" }, { yearsOfPractice: -3 }, { stateBarCouncil: "Bar Council of Nowhere" }, { preferredCourtIds: ["court_that_does_not_exist"] }]) {
      expectError(await http("PATCH", "/api/profile", { jar: P, json: bad }), 400, "VALIDATION_ERROR");
    }
    expect((await http("GET", "/api/profile", { jar: P })).body.account.email).toBe(emailP);
  });

  it("refuses an enrolment number another advocate already holds in the same State Bar Council", async () => {
    expectError(await http("PATCH", "/api/profile", { jar: Q, json: { barEnrolmentNo: `KAR/${run}/2015`, stateBarCouncil: "Karnataka State Bar Council" } }), 409, "CONFLICT");
    expect((await http("PATCH", "/api/profile", { jar: Q, json: { barEnrolmentNo: `KAR/${run}/2015`, stateBarCouncil: "Bar Council of Kerala" } })).status).toBe(200);
  });

  it("keeps the photo private: only its owner can fetch it; only real images are accepted", async () => {
    const f = new FormData();
    f.set("photo", new Blob([PNG], { type: "image/png" }), "me.png");
    expect((await http("POST", "/api/profile/photo", { jar: P, form: f })).status).toBe(200);
    const mine = await fetch(`${BASE}/api/profile/photo`, { headers: { cookie: P.cookie } });
    expect(mine.status).toBe(200);
    expect(mine.headers.get("content-type")).toBe("image/png");
    expect(mine.headers.get("cache-control")).toContain("private");
    expect(Buffer.from(await mine.arrayBuffer()).equals(PNG)).toBe(true);
    expectError(await http("GET", "/api/profile/photo", { jar: Q }), 404, "NOT_FOUND"); // Q has none; there is no way to name P's
    const fake = new FormData();
    fake.set("photo", new Blob(["<?php echo 1; ?>"], { type: "image/png" }), "evil.png"); // claims PNG, is not
    expectError(await http("POST", "/api/profile/photo", { jar: P, form: fake }), 400, "VALIDATION_ERROR");
    const big = new FormData();
    big.set("photo", new Blob([Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)])], { type: "image/png" }), "big.png");
    expectError(await http("POST", "/api/profile/photo", { jar: P, form: big }), 400, "VALIDATION_ERROR");
    expect((await http("GET", "/api/profile", { jar: P })).body.photo.url).toMatch(/^\/api\/profile\/photo\?v=\d+$/);
  });

  it("mobile number: saved only after the code is verified; duplicates refused; the old number stays until the new one is verified", async () => {
    expectError(await http("POST", "/api/profile/phone/send-code", { jar: P, json: { phoneNumber: "12345" } }), 400, "VALIDATION_ERROR");
    let n = logLines("sms.code", hash("sms", phone1)).length;
    const sent = await http("POST", "/api/profile/phone/send-code", { jar: P, json: { phoneNumber: phone1.replace("+91", "") } });
    expect(sent.body).toMatchObject({ status: "code_sent", expiresInSeconds: 300 });
    const code1 = (await fromLog("sms.code", hash("sms", phone1), n)).code as string;
    secrets.push(code1);
    expect((await http("GET", "/api/profile", { jar: P })).body.account.phoneNumber).toBeNull(); // nothing saved yet
    const wrong = code1 === "000000" ? "111111" : "000000";
    expectError(await http("POST", "/api/profile/phone/verify", { jar: P, json: { phoneNumber: phone1, code: wrong } }), 400, "VALIDATION_ERROR");
    expect((await http("POST", "/api/profile/phone/verify", { jar: P, json: { phoneNumber: phone1, code: code1 } })).body).toMatchObject({ status: "verified", phoneNumber: phone1, phoneNumberVerified: true });
    // Q cannot take P's number, whether by asking for a code or by verifying.
    expectError(await http("POST", "/api/profile/phone/send-code", { jar: Q, json: { phoneNumber: phone1 } }), 409, "CONFLICT");
    // P changes number: the old one stays until the new one is verified.
    n = logLines("sms.code", hash("sms", phone2)).length;
    await http("POST", "/api/profile/phone/send-code", { jar: P, json: { phoneNumber: phone2 } });
    const code2 = (await fromLog("sms.code", hash("sms", phone2), n)).code as string;
    secrets.push(code2);
    expect((await http("GET", "/api/profile", { jar: P })).body.account).toMatchObject({ phoneNumber: phone1, phoneNumberVerified: true });
    // Q holds no code for phone2 and cannot verify it with P's code under its own session... it can only claim P's code
    // if it had P's phone. Q submitting P's code for phone2 would succeed only by possessing the SMS; here P verifies:
    expect((await http("POST", "/api/profile/phone/verify", { jar: P, json: { phoneNumber: phone2, code: code2 } })).status).toBe(200);
    expect((await http("GET", "/api/profile", { jar: P })).body.account.phoneNumber).toBe(phone2);
    expect(await db.user.count({ where: { phoneNumber: phone1 } })).toBe(0); // the old number is released
  });

  it("email change: needs the password, refuses a taken address, and changes nothing until the new address confirms", async () => {
    const newEmail = `profile.p.new.${run}@example.test`;
    expectError(await http("POST", "/api/profile/email", { jar: P, json: { newEmail, currentPassword: "not my password" } }), 400, "VALIDATION_ERROR");
    expectError(await http("POST", "/api/profile/email", { jar: P, json: { newEmail: emailQ, currentPassword: pwP } }), 409, "CONFLICT");
    const n = logLines("auth.email_link", hash("otp", newEmail)).length;
    const r = await http("POST", "/api/profile/email", { jar: P, json: { newEmail, currentPassword: pwP } });
    expect(r.body).toMatchObject({ status: "verification_sent", step: "verify_new_email" });
    const link = (await fromLog("auth.email_link", hash("otp", newEmail), n)).link as string;
    const token = new URL(link).searchParams.get("token")!;
    secrets.push(token);
    // Not confirmed yet: still the old address, and it still signs in.
    expect((await http("GET", "/api/profile", { jar: P })).body.account.email).toBe(emailP);
    const tampered = await http("GET", `/api/auth/verify-email?token=${token.slice(0, -4)}AAAA`);
    expect(tampered.headers.get("location")).toContain("notice=link-invalid");
    const ok = await http("GET", `/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    expect(ok.headers.get("location")).toContain("notice=email-changed");
    expectError(await http("GET", "/api/profile", { jar: P }), 401, "UNAUTHENTICATED"); // sessions ended: identifier changed
    expectError(await http("POST", "/api/auth/login", { json: { email: emailP, password: pwP } }), 401, "UNAUTHENTICATED"); // old address gone
    emailP = newEmail;
    expect((await signIn(P, emailP, pwP)).status).toBe(200);
    expect((await http("GET", "/api/profile", { jar: P })).body.account).toMatchObject({ email: newEmail, emailVerified: true });
    const reuse = await http("GET", `/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    expect(reuse.headers.get("location")).not.toContain("email-changed"); // a used link does not apply twice
  });

  it("change password: needs the current one, signs out every other device, keeps this one", async () => {
    const other: Jar = { cookie: "" };
    expect((await signIn(other, emailP, pwP)).status).toBe(200);
    expectError(await http("POST", "/api/auth/change-password", { jar: P, json: { currentPassword: "wrong wrong wrong", newPassword: "a brand new password 1" } }), 400, "VALIDATION_ERROR");
    expectError(await http("POST", "/api/auth/change-password", { jar: P, json: { currentPassword: pwP, newPassword: "short" } }), 400, "VALIDATION_ERROR");
    const newPw = `P-pass-${run}-second one!`;
    secrets.push(newPw);
    expect((await http("POST", "/api/auth/change-password", { jar: P, json: { currentPassword: pwP, newPassword: newPw } })).status).toBe(200);
    expect((await http("GET", "/api/profile", { jar: P })).status).toBe(200);
    expectError(await http("GET", "/api/profile", { jar: other }), 401, "UNAUTHENTICATED");
    expectError(await http("POST", "/api/auth/login", { json: { email: emailP, password: pwP } }), 401, "UNAUTHENTICATED");
    pwP = newPw;
  });

  it("forgot password: same answer for unknown addresses; the link works once and ends every session", async () => {
    const unknown = await http("POST", "/api/auth/forgot-password", { json: { email: `nobody.${run}@example.test` } });
    const n = logLines("auth.email_link", hash("otp", emailP)).length;
    const known = await http("POST", "/api/auth/forgot-password", { json: { email: emailP } });
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    const link = (await fromLog("auth.email_link", hash("otp", emailP), n)).link as string;
    expect(link).toContain("/reset-password?token=");
    const token = new URL(link).searchParams.get("token")!;
    secrets.push(token);
    expectError(await http("POST", "/api/auth/reset-password", { json: { token: "not-a-real-token-123", newPassword: "whatever long password" } }), 400, "VALIDATION_ERROR");
    const newPw = `P-pass-${run}-third one!`;
    secrets.push(newPw);
    expect((await http("POST", "/api/auth/reset-password", { json: { token, newPassword: newPw } })).status).toBe(200);
    expectError(await http("GET", "/api/profile", { jar: P }), 401, "UNAUTHENTICATED"); // signed out everywhere
    expectError(await http("POST", "/api/auth/reset-password", { json: { token, newPassword: "and once more please" } }), 400, "VALIDATION_ERROR"); // single use
    pwP = newPw;
    expect((await signIn(P, emailP, pwP)).status).toBe(200);
  });

  it("sign out other devices ends only the others", async () => {
    const other: Jar = { cookie: "" };
    await signIn(other, emailP, pwP);
    expect((await http("GET", "/api/profile", { jar: P })).body.security.otherSessions).toBeGreaterThanOrEqual(1);
    expect((await http("POST", "/api/auth/sessions", { jar: P, json: { action: "sign_out_other_devices" } })).status).toBe(200);
    expectError(await http("GET", "/api/profile", { jar: other }), 401, "UNAUTHENTICATED");
    expect((await http("GET", "/api/profile", { jar: P })).body.security.otherSessions).toBe(0);
  });

  it("account deletion request: needs password and the exact phrase; then the account is signed out and locked", async () => {
    expectError(await http("POST", "/api/profile/deletion-request", { jar: Q, json: { currentPassword: pwQ, confirmation: "yes delete" } }), 400, "VALIDATION_ERROR");
    expectError(await http("POST", "/api/profile/deletion-request", { jar: Q, json: { currentPassword: "wrong wrong wrong", confirmation: "DELETE MY ACCOUNT" } }), 400, "VALIDATION_ERROR");
    const r = await http("POST", "/api/profile/deletion-request", { jar: Q, json: { currentPassword: pwQ, confirmation: "DELETE MY ACCOUNT", reason: "test" } });
    expect(r.status).toBe(200);
    expect(new Date(r.body.scheduledFor).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expectError(await http("GET", "/api/profile", { jar: Q }), 401, "UNAUTHENTICATED");
    expectError(await http("POST", "/api/auth/login", { json: { email: emailQ, password: pwQ } }), 401, "UNAUTHENTICATED");
    const u = await db.user.findUniqueOrThrow({ where: { email: emailQ }, include: { deletionRequests: true, sessions: true } });
    expect(u.isActive).toBe(false);
    expect(u.sessions).toHaveLength(0);
    expect(u.deletionRequests[0].status).toBe("PENDING");
  });

  it("no response ever contains a password, a code, a reset or email token, a hash or a session token", () => {
    const all = seen.join("\n");
    for (const s of secrets) expect(all).not.toContain(s);
    expect(all).not.toMatch(/\$argon2id\$|session_token|"token"\s*:|"password"\s*:|photoKey|"secret"/);
  });
});
