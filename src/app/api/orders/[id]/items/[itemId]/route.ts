import { NextResponse } from "next/server";
import { jsonError, readJson, requireApiUser } from "@/lib/api";
import { getOrderDetail, updateOrderItem, voidOrderItem } from "@/lib/orders";
import { updateItemSchema, voidItemSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const user = await requireApiUser("manager", "waiter");
    const { id, itemId } = await context.params;
    const input = updateItemSchema.parse(await readJson(request));
    updateOrderItem({
      restaurantId: user.restaurantId,
      actor: user,
      itemId: Number(itemId),
      qty: input.qty,
      notes: input.notes,
    });
    return NextResponse.json(getOrderDetail(user.restaurantId, Number(id)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const user = await requireApiUser("manager", "waiter");
    const { id, itemId } = await context.params;
    const input = voidItemSchema.parse(await readJson(request));
    voidOrderItem({ restaurantId: user.restaurantId, actor: user, itemId: Number(itemId), reason: input.reason });
    return NextResponse.json(getOrderDetail(user.restaurantId, Number(id)));
  } catch (error) {
    return jsonError(error);
  }
}
