import { NextResponse } from "next/server";
import { route } from "@/lib/server";
import { getPhoto, removePhoto, requireAccount, setPhoto } from "@/lib/profile/service";
import { MAX_PHOTO_BYTES } from "@/lib/profile/constants";
import { hitLimit } from "@/lib/rate-limit";
import { ValidationError } from "@/lib/services/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The photo is kept in private storage and served only here, only to its owner (there is no public photo URL).
export const GET = route(async () => {
  const s = await requireAccount();
  const { bytes, mime } = await getPhoto(s.userId);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; sandbox", "X-Content-Type-Options": "nosniff" } });
});

// POST multipart/form-data { photo: File } (JPEG/PNG/WebP, max 2 MB, type checked from the bytes)
export const POST = route(async (req) => {
  const s = await requireAccount();
  await hitLimit("profile-photo", s.userId, 20, 60 * 60);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PHOTO_BYTES + 64 * 1024) throw new ValidationError("The photo is larger than 2 MB.");
  const f = (await req.formData()).get("photo");
  if (!f || typeof f === "string") throw new ValidationError("Choose a photo.");
  await setPhoto(s.userId, new Uint8Array(await f.arrayBuffer()));
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async () => {
  const s = await requireAccount();
  await removePhoto(s.userId);
  return NextResponse.json({ ok: true });
});
