import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/api";
import { getOrderDetail } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("manager", "waiter");
    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    return NextResponse.json(getOrderDetail(user.restaurantId, orderId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
