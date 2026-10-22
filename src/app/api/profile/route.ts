import { NextResponse } from "next/server";
import { route } from "@/lib/server";
import { getProfileView, requireAccount, updateProfile } from "@/lib/profile/service";
import { currentSessionToken } from "@/lib/profile/http";
import { profilePatchSchema } from "@/lib/profile/schemas";
import { hitLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/profile -> the signed-in advocate's own profile, verification status and completion. No secrets.
export const GET = route(async (req) => {
  const s = await requireAccount();
  return NextResponse.json(await getProfileView(s.userId, await currentSessionToken(req.headers)), { headers: { "Cache-Control": "no-store" } });
});

// PATCH /api/profile { name?, barEnrolmentNo?, ... } -> updated profile.
// Omitted or blank fields keep their value; null clears. Email and mobile cannot be changed here (they need verification).
export const PATCH = route(async (req) => {
  const s = await requireAccount();
  await hitLimit("profile-update", s.userId, 60, 60 * 60);
  await updateProfile(s.userId, profilePatchSchema.parse(await req.json()));
  return NextResponse.json(await getProfileView(s.userId, await currentSessionToken(req.headers)), { headers: { "Cache-Control": "no-store" } });
});
