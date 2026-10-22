import { documents, pageData, route } from "@/lib/server";
export const dynamic = "force-dynamic";
import { NotFoundError } from "@/lib/services/workspace";

// Serves an original document only to members of the office that owns it.
export const GET = route(async (_req, { params }: { params: { id: string } }) => {
  const { ws } = await pageData();
  const d = ws.documents.find((x) => x.id === params.id);
  if (!d) throw new NotFoundError("Document not found");
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
