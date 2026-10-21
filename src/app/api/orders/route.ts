import { NextResponse } from "next/server";
import { jsonError, readJson, requireApiUser } from "@/lib/api";
import { openOrder } from "@/lib/orders";
import { openOrderSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser("manager", "waiter");
    const input = openOrderSchema.parse(await readJson(request));
    const order = openOrder({
      restaurantId: user.restaurantId,
      actor: user,
      tableId: input.tableId,
      guests: input.guests,
      notes: input.notes,
    });
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
