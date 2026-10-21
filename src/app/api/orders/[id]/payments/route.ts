import { NextResponse } from "next/server";
import { jsonError, readJson, requireApiUser } from "@/lib/api";
import { addPayment, getOrderDetail } from "@/lib/orders";
import { paymentSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("manager", "waiter");
    const { id } = await context.params;
    const input = paymentSchema.parse(await readJson(request));
    const result = addPayment({
      restaurantId: user.restaurantId,
      actor: user,
      orderId: Number(id),
      amountCents: input.amountCents,
      method: input.method,
      reference: input.reference,
      idempotencyKey: input.idempotencyKey,
    });
    return NextResponse.json({ ...result, order: getOrderDetail(user.restaurantId, Number(id)) }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
