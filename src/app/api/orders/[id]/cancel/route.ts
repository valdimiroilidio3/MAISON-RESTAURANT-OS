import { NextResponse } from "next/server";
import { jsonError, readJson, requireApiUser } from "@/lib/api";
import { cancelOrder, getOrderDetail } from "@/lib/orders";
import { cancelOrderSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("manager");
    const { id } = await context.params;
    const input = cancelOrderSchema.parse(await readJson(request));
    cancelOrder({ restaurantId: user.restaurantId, actor: user, orderId: Number(id), reason: input.reason });
    return NextResponse.json(getOrderDetail(user.restaurantId, Number(id)));
  } catch (error) {
    return jsonError(error);
  }
}
