import { NextResponse } from "next/server";
import { jsonError, requireApiUser } from "@/lib/api";
import { confirmPayment } from "@/lib/orders";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser("manager");
    const { id } = await context.params;
    confirmPayment({ restaurantId: user.restaurantId, actor: user, paymentId: Number(id) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
