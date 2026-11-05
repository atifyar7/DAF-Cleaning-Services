import { headers } from "next/headers";
import { authorize } from "@/lib/dal";
import { env } from "@/lib/env";
import { writeAudit } from "@/lib/audit";
import { consume, limits } from "@/lib/rate-limit";
import { exportBookingsCsv, parseRange } from "@/lib/super-admin/reports";

// Downloads bookings for a date range as a spreadsheet file. Super Admin only, rate-limited and logged,
// because the file contains customer contact details.
export async function GET(request: Request) {
  let userId: string;
  try {
    const { actor } = await authorize("report.view");
    if (actor.role !== "super_admin") throw new Error("Not authorized");
    userId = actor.userId;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!(await consume(limits.adminExport, userId))) {
    return new Response("Too many exports. Please try again later.", { status: 429 });
  }

  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get("from"), params.get("to"));
  const { csv, count } = await exportBookingsCsv({ role: "super_admin", userId }, range);
  await writeAudit({
    actorId: userId,
    actorRole: "super_admin",
    action: "report.exported",
    entity: "booking",
    entityId: `${range.from}..${range.to}`,
    ipAddress: (await headers()).get(env.CLIENT_IP_HEADER),
    meta: { rows: count },
  });

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="dar-al-falak-bookings-${range.from}-to-${range.to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
