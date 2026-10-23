import { owned } from "@/lib/authz";
import { reviewView } from "@/lib/ai/services/review";
import { apiData, route } from "@/lib/server";

// GET /api/ai/extractions/:id -> the draft, with conflicts and differences against the matched case.
// Another office's id and an unknown id give the same 404.
export const GET = route(async (_req, { params }: { params: { id: string } }) => {
  const { ws } = await apiData();
  return { extraction: reviewView(ws, owned.job(ws, params.id)) };
});
