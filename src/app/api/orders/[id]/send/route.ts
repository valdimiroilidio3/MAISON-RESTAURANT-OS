import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/api";
import { getOrderDetail, sendOrder } from "@/lib/orders";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("manager", "waiter");
    const { id } = await context.params;
    const result = sendOrder({ restaurantId: user.restaurantId, actor: user, orderId: Number(id) });
    return NextResponse.json({ ...result, order: getOrderDetail(user.restaurantId, Number(id)) });
  } catch (error) {
    return jsonError(error);
  }
}
