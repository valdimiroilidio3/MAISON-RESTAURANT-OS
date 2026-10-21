import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { publicAvailability } from "@/lib/reservations";
import { availabilityQuerySchema } from "@/lib/validation";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const limit = rateLimit(clientKey(request, "availability"), 60, 5 * 60_000);
    if (!limit.ok) return NextResponse.json({ error: "Demasiados pedidos." }, { status: 429 });
    const url = new URL(request.url);
    const input = availabilityQuerySchema.parse({
      date: url.searchParams.get("date") ?? "",
      partySize: url.searchParams.get("partySize") ?? "2",
    });
    return NextResponse.json(publicAvailability(input.date, input.partySize), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}
