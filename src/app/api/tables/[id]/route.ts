import { NextResponse } from "next/server";
import { jsonError, readJson, requireApiUser } from "@/lib/api";
import { getTableDetail, markTableCleaning, releaseTable, syncTableStatus } from "@/lib/orders";
import { tableActionSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("manager", "waiter");
    const { id } = await context.params;
    return NextResponse.json(getTableDetail(user.restaurantId, Number(id)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("manager", "waiter");
    const { id } = await context.params;
    const tableId = Number(id);
    const input = tableActionSchema.parse(await readJson(request));
    if (input.action === "release") {
      releaseTable({ restaurantId: user.restaurantId, actor: user, tableId });
    } else {
      markTableCleaning({ restaurantId: user.restaurantId, actor: user, tableId });
    }
    return NextResponse.json({ ok: true, status: syncTableStatus(tableId, user.restaurantId) });
  } catch (error) {
    return jsonError(error);
  }
}
