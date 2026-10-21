import { NextResponse } from "next/server";
import { jsonError, readJson, requireApiUser } from "@/lib/api";
import { applyDiscount, getOrderDetail } from "@/lib/orders";
import { discountSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("manager");
    const { id } = await context.params;
    const input = discountSchema.parse(await readJson(request));
    applyDiscount({ restaurantId: user.restaurantId, actor: user, orderId: Number(id), discountCents: input.discountCents });
    return NextResponse.json(getOrderDetail(user.restaurantId, Number(id)));
  } catch (error) {
    return jsonError(error);
  }
}
