import { apiData, route } from "@/lib/server";
export const dynamic = "force-dynamic";
import { calendarCsv } from "@/lib/services/queries";

export const GET = route(async () => {
  const { ws } = await apiData();
  return new Response("﻿" + calendarCsv(ws), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="advoflow-calendar.csv"', "Cache-Control": "no-store" },
  });
});
