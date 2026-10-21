import { NextResponse } from "next/server";
import { jsonError, readJson, requireApiUser } from "@/lib/api";
import { addOrderItem, getOrderDetail } from "@/lib/orders";
import { addItemSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("manager", "waiter");
    const { id } = await context.params;
    const orderId = Number(id);
    const input = addItemSchema.parse(await readJson(request));
    addOrderItem({
      restaurantId: user.restaurantId,
      actor: user,
      orderId,
      productId: input.productId,
      qty: input.qty,
      notes: input.notes,
      modifierIds: input.modifierIds,
    });
    return NextResponse.json(getOrderDetail(user.restaurantId, orderId), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
