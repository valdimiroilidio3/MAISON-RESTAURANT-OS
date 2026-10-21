import { jsonError, requireApiUser } from "@/lib/api";
import { buildOrdersCsv, validateRange } from "@/lib/reports";
import { localDate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser("manager");
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? localDate(-6);
    const to = url.searchParams.get("to") ?? localDate(0);
    validateRange(from, to);
    const csv = buildOrdersCsv(user.restaurantId, from, to);
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="maison-vendas-${from}_${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
