import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "../db/prisma";
import { config } from "../config";
import { documents } from "../server";
import { logger } from "../logger";
import { requireSession } from "../session";
import { NotFoundError, PermissionError, ValidationError } from "../services/workspace";
import { ConflictError } from "../store/types";
import { DELETION_WAIT_DAYS, MAX_PHOTO_BYTES } from "./constants";
import { profileCompletion } from "./completion";
import { sinceToYears, yearsToSince, type ProfilePatch } from "./schemas";

// The advocate profile. Every function takes the user id from the verified session (requireAccount), never from
// the request, so one advocate can only ever read or change their own profile.

/** A signed-in person with a real account (password mode). The shared demo has no personal profile. */
export async function requireAccount() {
  const s = await requireSession();
  if (s.mode !== "password") throw new PermissionError("Profiles are available for signed-in accounts, not the shared demo.");
  return s;
}

const db = () => {
  const p = getPrisma();
  if (!p) throw new Error("Profiles need DATABASE_URL (PostgreSQL).");
  return p;
};

export async function getProfileView(userId: string, currentSessionToken?: string) {
  const u = await db().user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, emailVerified: true, phoneNumber: true, phoneNumberVerified: true, createdAt: true,
      profile: true,
      sessions: { where: { expiresAt: { gt: new Date() } }, select: { token: true } },
      deletionRequests: { where: { status: "PENDING" }, select: { requestedAt: true, scheduledFor: true } },
      memberships: { select: { role: true, office: { select: { id: true, name: true } } } },
    },
  });
  const p = u.profile;
  const courts = p?.preferredCourtIds.length
    ? await db().court.findMany({ where: { id: { in: p.preferredCourtIds } }, select: { id: true, name: true } })
    : [];
  const view = {
    account: { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, phoneNumber: u.phoneNumber, phoneNumberVerified: u.phoneNumberVerified, memberSince: u.createdAt.toISOString() },
    offices: u.memberships.map((m) => ({ id: m.office.id, name: m.office.name, role: m.role.toLowerCase() })),
    profile: {
      barEnrolmentNo: p?.barEnrolmentNo ?? null,
      stateBarCouncil: p?.stateBarCouncil ?? null,
      yearsOfPractice: sinceToYears(p?.practiceSinceYear ?? null),
      practiceAreas: p?.practiceAreas ?? [],
      officeAddressLine1: p?.officeAddressLine1 ?? null,
      officeAddressLine2: p?.officeAddressLine2 ?? null,
      officeCity: p?.officeCity ?? null,
      officeState: p?.officeState ?? null,
      officePincode: p?.officePincode ?? null,
      preferredCourts: courts.map((c) => ({ id: c.id, name: c.name })),
      preferredCourtLocations: p?.preferredCourtLocations ?? [],
    },
    photo: p?.photoKey ? { url: `/api/profile/photo?v=${p.photoUpdatedAt?.getTime() ?? 0}` } : null,
    security: {
      activeSessions: u.sessions.length,
      otherSessions: u.sessions.filter((x) => x.token !== currentSessionToken).length,
      deletionRequested: u.deletionRequests[0] ? { requestedAt: u.deletionRequests[0].requestedAt.toISOString(), scheduledFor: u.deletionRequests[0].scheduledFor.toISOString() } : null,
      twoStepLogin: config.twoStepLogin,
    },
    completion: profileCompletion({
      name: u.name, emailVerified: u.emailVerified, phoneNumberVerified: u.phoneNumberVerified, hasPhoto: !!p?.photoKey,
      barEnrolmentNo: p?.barEnrolmentNo ?? null, stateBarCouncil: p?.stateBarCouncil ?? null, practiceSinceYear: p?.practiceSinceYear ?? null,
      practiceAreas: p?.practiceAreas ?? [], officeAddressLine1: p?.officeAddressLine1 ?? null, officeCity: p?.officeCity ?? null,
      officePincode: p?.officePincode ?? null, preferredCourtIds: p?.preferredCourtIds ?? [], preferredCourtLocations: p?.preferredCourtLocations ?? [],
    }),
  };
  return view;
}

/** Apply a validated patch. Omitted or blank fields keep their value; null clears; lists are replaced as sent. */
export async function updateProfile(userId: string, patch: ProfilePatch) {
  const data: Prisma.AdvocateProfileUncheckedUpdateInput = {};
  const text = (k: "barEnrolmentNo" | "officeAddressLine1" | "officeAddressLine2" | "officeCity" | "officeState" | "officePincode") => {
    const v = patch[k];
    if (v === null) data[k] = null;
    else if (typeof v === "string" && v.trim()) data[k] = v.trim().replace(/\s+/g, " ");
  };
  (["barEnrolmentNo", "officeAddressLine1", "officeAddressLine2", "officeCity", "officeState", "officePincode"] as const).forEach(text);
  if (typeof data.barEnrolmentNo === "string") data.barEnrolmentNo = data.barEnrolmentNo.toUpperCase();
  if (patch.stateBarCouncil === null) data.stateBarCouncil = null;
  else if (patch.stateBarCouncil) data.stateBarCouncil = patch.stateBarCouncil;
  if (patch.yearsOfPractice === null) data.practiceSinceYear = null;
  else if (typeof patch.yearsOfPractice === "number") data.practiceSinceYear = yearsToSince(patch.yearsOfPractice);
  if (patch.practiceAreas) data.practiceAreas = [...new Set(patch.practiceAreas.map((a) => a.trim()))];
  if (patch.preferredCourtLocations) data.preferredCourtLocations = [...new Set(patch.preferredCourtLocations.map((a) => a.trim()))];
  if (patch.preferredCourtIds) {
    const ids = [...new Set(patch.preferredCourtIds)];
    const officeIds = (await db().membership.findMany({ where: { userId }, select: { officeId: true } })).map((m) => m.officeId);
    const found = await db().court.count({ where: { id: { in: ids }, OR: [{ officeId: null }, { officeId: { in: officeIds } }] } });
    if (found !== ids.length) throw new ValidationError("One of the selected courts is not in the court list.");
    data.preferredCourtIds = ids;
  }
  try {
    await db().$transaction(async (tx) => {
      if (patch.name) await tx.user.update({ where: { id: userId }, data: { name: patch.name.trim() } });
      if (Object.keys(data).length) {
        await tx.advocateProfile.upsert({ where: { userId }, create: { ...(data as Prisma.AdvocateProfileUncheckedCreateInput), userId }, update: data });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DuplicateError("This enrolment number is already registered to another advocate in that State Bar Council.");
    }
    throw e;
  }
  logger.info("profile.updated", { userId, fields: [...Object.keys(data), ...(patch.name ? ["name"] : [])] });
}

export class DuplicateError extends ConflictError {
  constructor(public readonly reason: string) {
    super();
    this.message = reason;
  }
}

// ---- photo (private storage; served only to the owner by GET /api/profile/photo)

const IMAGE_TYPES: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/webp", ext: "webp", test: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
];
const storageOwner = (userId: string) => `profile-${userId}`;

export async function setPhoto(userId: string, bytes: Uint8Array) {
  if (!bytes.length) throw new ValidationError("Choose a photo.");
  if (bytes.length > MAX_PHOTO_BYTES) throw new ValidationError("The photo is larger than 2 MB.");
  const type = IMAGE_TYPES.find((t) => t.test(bytes)); // by content, not by file name or browser-supplied type
  if (!type) throw new ValidationError("Use a JPEG, PNG or WebP image.");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = await documents.put(storageOwner(userId), sha, type.ext, bytes);
  const before = await db().advocateProfile.findUnique({ where: { userId }, select: { photoKey: true } });
  await db().advocateProfile.upsert({
    where: { userId },
    create: { userId, photoKey: key, photoMime: type.mime, photoUpdatedAt: new Date() },
    update: { photoKey: key, photoMime: type.mime, photoUpdatedAt: new Date() },
  });
  if (before?.photoKey && before.photoKey !== key) await documents.remove(before.photoKey);
  logger.info("profile.photo_set", { userId, bytes: bytes.length });
}

export async function getPhoto(userId: string) {
  const p = await db().advocateProfile.findUnique({ where: { userId }, select: { photoKey: true, photoMime: true } });
  if (!p?.photoKey || !p.photoMime) throw new NotFoundError("No photo");
  return { bytes: await documents.get(p.photoKey), mime: p.photoMime };
}

export async function removePhoto(userId: string) {
  const p = await db().advocateProfile.findUnique({ where: { userId }, select: { photoKey: true } });
  if (!p?.photoKey) return;
  await db().advocateProfile.update({ where: { userId }, data: { photoKey: null, photoMime: null, photoUpdatedAt: new Date() } });
  await documents.remove(p.photoKey);
  logger.info("profile.photo_removed", { userId });
}

// ---- account deletion request

export async function requestDeletion(userId: string, reason?: string) {
  const memberships = await db().membership.findMany({ where: { userId }, select: { officeId: true, role: true } });
  for (const m of memberships.filter((x) => x.role === "OWNER")) {
    const [owners, others] = await Promise.all([
      db().membership.count({ where: { officeId: m.officeId, role: "OWNER", user: { isActive: true } } }),
      db().membership.count({ where: { officeId: m.officeId, userId: { not: userId }, user: { isActive: true } } }),
    ]);
    if (owners === 1 && others > 0) {
      throw new DuplicateError("You are the only owner of an office that other people still use. Make one of them an owner first, so the office is not left without one.");
    }
  }
  const scheduledFor = new Date(Date.now() + DELETION_WAIT_DAYS * 86_400_000);
  await db().$transaction([
    db().accountDeletionRequest.create({ data: { userId, reason: reason || null, scheduledFor } }),
    db().user.update({ where: { id: userId }, data: { isActive: false } }), // cannot sign in from now on
    db().session.deleteMany({ where: { userId } }), // every device signed out now
  ]);
  logger.warn("account.deletion_requested", { userId, scheduledFor: scheduledFor.toISOString() });
  return { scheduledFor: scheduledFor.toISOString() };
}
