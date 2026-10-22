import { apiData, route } from "@/lib/server";
export const dynamic = "force-dynamic";
import { authorize } from "@/lib/authz";

// Office data export (owner only). Documents are listed by metadata; files stay in private storage.
export const GET = route(async () => {
  const { ws, session } = await apiData();
  authorize(session, "manage_office");
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), ...ws }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="advoflow-export.json"', "Cache-Control": "no-store" },
  });
});
