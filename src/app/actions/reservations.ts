"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getRestaurant, requireRole } from "@/lib/auth";
import {
  assignReservationTable,
  createReservation,
  updateReservationStatus,
} from "@/lib/reservations";
import { assignTableSchema, reservationSchema, reservationStatusSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/action-types";
import { errorState } from "@/lib/action-errors";

export async function createPublicReservationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    if (String(formData.get("company") ?? "").trim() !== "") {
      return { ok: false, message: "Pedido inválido." };
    }
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
    const limit = rateLimit(`reservation-action:${ip}`, 6, 10 * 60_000);
    if (!limit.ok) return { ok: false, message: "Demasiados pedidos. Tente novamente mais tarde." };

    const parsed = reservationSchema.parse({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      date: formData.get("date"),
      time: formData.get("time"),
      partySize: formData.get("partySize"),
      note: formData.get("note") ?? "",
    });
    const restaurant = getRestaurant();
    const result = createReservation({ restaurantId: restaurant.id, data: parsed });
    revalidatePath("/admin/reservas");
    revalidatePath("/reservas");
    return {
      ok: true,
      message: `Reserva ${result.reservation.code} registada. Mesa ${result.assignedTable ?? "a atribuir"}.`,
      data: {
        code: result.reservation.code,
        date: result.reservation.date,
        time: result.reservation.time,
        table: result.assignedTable ?? "",
        status: result.reservation.status,
      },
    };
  } catch (error) {
    return errorState(error, "Não foi possível registar a reserva.");
  }
}

export async function createAdminReservationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager", "waiter");
    const parsed = reservationSchema.parse({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      date: formData.get("date"),
      time: formData.get("time"),
      partySize: formData.get("partySize"),
      note: formData.get("note") ?? "",
      tableId: formData.get("tableId") ? Number(formData.get("tableId")) : undefined,
    });
    const result = createReservation({
      restaurantId: user.restaurantId,
      data: { ...parsed, source: "admin" },
      actor: user,
    });
    revalidatePath("/admin/reservas");
    revalidatePath("/admin");
    return {
      ok: true,
      message: `Reserva ${result.reservation.code} criada (mesa ${result.assignedTable ?? "—"}).`,
      data: { code: result.reservation.code },
    };
  } catch (error) {
    return errorState(error, "Não foi possível criar a reserva.");
  }
}

export async function updateReservationStatusAction(formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager", "waiter");
    const reservationId = z.coerce.number().int().positive().parse(formData.get("reservationId"));
    const status = reservationStatusSchema.shape.status.parse(formData.get("status"));
    const note = formData.get("note");
    updateReservationStatus({
      restaurantId: user.restaurantId,
      actor: user,
      reservationId,
      status,
      note: note != null ? String(note) : undefined,
    });
    revalidatePath("/admin/reservas");
    revalidatePath("/admin");
    return { ok: true, message: "Reserva atualizada." };
  } catch (error) {
    return errorState(error);
  }
}

export async function assignReservationTableAction(formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager", "waiter");
    const parsed = assignTableSchema.parse({
      reservationId: formData.get("reservationId"),
      tableId: formData.get("tableId"),
    });
    assignReservationTable({ restaurantId: user.restaurantId, actor: user, ...parsed });
    revalidatePath("/admin/reservas");
    return { ok: true, message: "Mesa atribuída." };
  } catch (error) {
    return errorState(error);
  }
}
