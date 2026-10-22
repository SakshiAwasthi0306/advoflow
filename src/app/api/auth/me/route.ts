import { NextResponse } from "next/server";
import { route } from "@/lib/server";
import { requireSession } from "@/lib/session";
import { getPrisma } from "@/lib/db/prisma";
import { publicUser } from "@/lib/auth/http";

export const dynamic = "force-dynamic";

// GET /api/auth/me -> 200 { user, office: { id, name, role }, mode } | 401
export const GET = route(async () => {
  const s = await requireSession();
  const prisma = getPrisma();
  const [user, office] = prisma && s.mode === "password"
    ? await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: s.userId }, select: { id: true, email: true, name: true } }),
        prisma.office.findUniqueOrThrow({ where: { id: s.officeId }, select: { id: true, name: true } }),
      ])
    : [{ id: s.userId, email: "", name: s.name }, { id: s.officeId, name: "Demo Chambers" }];
  return NextResponse.json({ user: publicUser(user), office: { ...office, role: s.role }, mode: s.mode }, { headers: { "Cache-Control": "no-store" } });
});
