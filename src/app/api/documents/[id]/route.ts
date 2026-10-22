import { documents, apiData, route } from "@/lib/server";
import { owned } from "@/lib/authz";
export const dynamic = "force-dynamic";

// Serves an original document only to members of the office that owns it.
export const GET = route(async (_req, { params }: { params: { id: string } }) => {
  const { ws } = await apiData();
  const d = owned.document(ws, params.id);
  const bytes = await documents.get(d.storageKey);
  const safe = d.filename.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": d.mime === "text/plain" ? "text/plain; charset=utf-8" : d.mime,
      "Content-Disposition": `inline; filename="${safe}"`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
