import { NextResponse } from "next/server";
import { requireApiUser, jsonError } from "@/lib/api";
import { listKitchenTickets } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json(listKitchenTickets(user.restaurantId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
