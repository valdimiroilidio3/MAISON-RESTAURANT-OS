import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { createReservation, MAX_PARTY_PUBLIC } from "@/lib/reservations";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { reservationSchema } from "@/lib/validation";
import { getRestaurant } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limit = rateLimit(clientKey(request, "reservation"), 6, 10 * 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Demasiados pedidos de reserva. Tente novamente mais tarde." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
    const input = reservationSchema.parse(await readJson(request));
    if (input.partySize > MAX_PARTY_PUBLIC) {
      return NextResponse.json({ error: "Para grupos maiores contacte-nos por telefone." }, { status: 400 });
    }
    const restaurant = getRestaurant();
    const result = createReservation({ restaurantId: restaurant.id, data: input });
    return NextResponse.json(
      {
        code: result.reservation.code,
        date: result.reservation.date,
        time: result.reservation.time,
        partySize: result.reservation.partySize,
        table: result.assignedTable,
        // why this table: the allocator's own explanation
        tableReason: result.assignedReason,
        status: result.reservation.status,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
