import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getFloorSnapshot } from "@/lib/orders";
import { listReservations, reservationStats } from "@/lib/reservations";
import { addDaysToDateString, formatDateLongPT } from "@/lib/reservations-rules";
import { localDate } from "@/lib/dates";
import { PageHeader } from "@/components/admin/AdminShell";
import { ReservationsBoard } from "@/components/admin/ReservationsBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reservas" };

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireRole("manager", "waiter");
  const params = await searchParams;
  const today = localDate(0);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : today;

  const days = Array.from({ length: 7 }).map((_, i) => addDaysToDateString(today, i));
  if (!days.includes(date)) days.unshift(date);

  const reservations = listReservations(user.restaurantId, { from: date, to: date, status: "all" });
  const snapshot = getFloorSnapshot(user.restaurantId);
  const stats = days.map((day) => ({ date: day, ...reservationStats(user.restaurantId, day) }));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Reservas"
        title="Agenda de reservas"
        description={`${formatDateLongPT(date)}. Conflitos de mesa e capacidade são bloqueados pelo servidor.`}
      />
      <ReservationsBoard
        reservations={reservations}
        tables={snapshot.tables.map((t) => ({ id: t.id, code: t.code, seats: t.seats, zoneName: t.zoneName, status: t.status }))}
        date={date}
        days={days}
        stats={stats.map((s) => ({ date: s.date, total: s.total, pending: s.pending, covers: s.covers, seated: s.seated }))}
      />
    </div>
  );
}
