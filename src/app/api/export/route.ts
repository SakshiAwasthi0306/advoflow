import { pageData, route } from "@/lib/server";
export const dynamic = "force-dynamic";
import { requireRole } from "@/lib/services/workspace";

// Office data export (owner only). Documents are listed by metadata; files stay in private storage.
export const GET = route(async () => {
  const { ws, session } = await pageData();
  requireRole(session, "owner");
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...ws }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="advoflow-export.json"', "Cache-Control": "no-store" },
  });
});
