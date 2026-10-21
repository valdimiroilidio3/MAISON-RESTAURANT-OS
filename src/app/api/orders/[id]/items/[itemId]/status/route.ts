import { NextResponse } from "next/server";
import { jsonError, readJson, requireApiUser } from "@/lib/api";
import { getOrderDetail, setItemStatus } from "@/lib/orders";
import { itemStatusSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const user = await requireApiUser("manager", "waiter", "chef");
    const { id, itemId } = await context.params;
    const input = itemStatusSchema.parse(await readJson(request));
    setItemStatus({ restaurantId: user.restaurantId, actor: user, itemId: Number(itemId), to: input.to });
    return NextResponse.json(getOrderDetail(user.restaurantId, Number(id)));
  } catch (error) {
    return jsonError(error);
  }
}
