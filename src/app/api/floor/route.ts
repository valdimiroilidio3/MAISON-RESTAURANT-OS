import { NextResponse } from "next/server";
import { requireApiUser, jsonError } from "@/lib/api";
import { getFloorSnapshot } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser("manager", "waiter");
    return NextResponse.json(getFloorSnapshot(user.restaurantId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
