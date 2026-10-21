import "server-only";
import { all, get, run, transaction } from "./db";
import { localDate, nowIso } from "./dates";
import { recordAudit } from "./audit";
import { badRequest, conflict, forbidden, notFound } from "./api";
import {
  SERVICE_WINDOWS,
  TURN_MINUTES,
  addDaysToDateString,
  fitsParty,
  fromMinutes,
  generateSlots,
  hasTableConflict,
  isDateTooFar,
  isPastDate,
  isWithinService,
  toMinutes,
} from "./reservations-rules";
import type { Reservation, ReservationStatus, SessionUser, TableStatus } from "./types";

export const MAX_PARTY_PUBLIC = 10;

interface ReservationRow {
  id: number;
  code: string;
  date: string;
  time: string;
  party_size: number;
  status: ReservationStatus;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  table_id: number | null;
  table_code: string | null;
  note: string;
  source: Reservation["source"];
  created_at: string;
  updated_at: string;
}

function mapReservation(r: ReservationRow): Reservation {
  return {
    id: r.id,
    code: r.code,
    date: r.date,
    time: r.time,
    partySize: r.party_size,
    status: r.status,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    tableId: r.table_id,
    tableCode: r.table_code,
    note: r.note,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const RESERVATION_SELECT = `
  SELECT r.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone, t.code AS table_code
  FROM reservations r
  JOIN customers c ON c.id = r.customer_id
  LEFT JOIN tables t ON t.id = r.table_id
`;

type RawBooking = { id: number; table_id: number | null; time: string; status: string };

function toInterval(row: RawBooking) {
  return { id: row.id, tableId: row.table_id, time: row.time, status: row.status, durationMinutes: TURN_MINUTES };
}

export function listReservations(
  restaurantId: number,
  options: { from: string; to: string; status?: ReservationStatus | "all" },
): Reservation[] {
  const statusFilter = options.status && options.status !== "all" ? "AND r.status = ?" : "";
  const params: (string | number)[] = statusFilter
    ? [restaurantId, options.from, options.to, String(options.status)]
    : [restaurantId, options.from, options.to];
  return all<ReservationRow>(
    `${RESERVATION_SELECT}
     WHERE r.restaurant_id = ? AND r.date >= ? AND r.date <= ? ${statusFilter}
     ORDER BY r.date ASC, r.time ASC, r.id ASC`,
    ...params,
  ).map(mapReservation);
}

export function getReservation(restaurantId: number, id: number): Reservation {
  const row = get<ReservationRow>(`${RESERVATION_SELECT} WHERE r.restaurant_id=? AND r.id=?`, restaurantId, id);
  if (!row) throw notFound("Reserva não encontrada");
  return mapReservation(row);
}

interface Slot {
  time: string;
  availableTables: number;
  capacity: number;
}

export function availabilityForDate(
  restaurantId: number,
  date: string,
  partySize: number,
  excludeReservationId?: number,
): Slot[] {
  const tables = all<{ id: number; seats: number; status: TableStatus }>(
    "SELECT id, seats, status FROM tables WHERE restaurant_id=? AND status <> 'cleaning' ORDER BY seats",
    restaurantId,
  );
  const existing = all<{
    id: number;
    table_id: number | null;
    time: string;
    status: string;
    party_size: number;
  }>(
    `SELECT id,table_id,time,status,party_size FROM reservations
     WHERE restaurant_id=? AND date=? AND status IN ('pending','confirmed','seated')`,
    restaurantId,
    date,
  );

  return generateSlots(SERVICE_WINDOWS).map((time) => {
    const free = tables.filter((table) => {
      if (!fitsParty(table.seats, partySize)) return false;
      const conflict = hasTableConflict(
        existing.map(toInterval),
        { time, tableId: table.id, ignoreId: excludeReservationId },
      );
      return !conflict;
    });
    return {
      time,
      availableTables: free.length,
      capacity: free.reduce((sum, t) => sum + t.seats, 0),
    };
  });
}

function pickTableForSlot(
  restaurantId: number,
  date: string,
  time: string,
  partySize: number,
  excludeReservationId?: number,
): { id: number; code: string; seats: number } | null {
  const tables = all<{ id: number; code: string; seats: number }>(
    "SELECT id, code, seats FROM tables WHERE restaurant_id=? AND status <> 'cleaning' ORDER BY seats ASC, code ASC",
    restaurantId,
  );
  const existing = all<{ id: number; table_id: number | null; time: string; status: string }>(
    `SELECT id,table_id,time,status FROM reservations
     WHERE restaurant_id=? AND date=? AND status IN ('pending','confirmed','seated')`,
    restaurantId,
    date,
  );
  for (const table of tables) {
    if (!fitsParty(table.seats, partySize)) continue;
    const conflict = hasTableConflict(
      existing.map(toInterval),
      { time, tableId: table.id, ignoreId: excludeReservationId },
    );
    if (!conflict) return table;
  }
  return null;
}

function nextReservationCode(restaurantId: number): string {
  const row = get<{ max: number | null }>(
    `SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) AS max FROM reservations WHERE restaurant_id=? AND code LIKE 'RSV-%'`,
    restaurantId,
  );
  return `RSV-${Math.max(2400, Number(row?.max ?? 2400)) + 1}`;
}

export interface ReservationInput {
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  partySize: number;
  note?: string;
  source?: Reservation["source"];
  tableId?: number | null;
}

export function createReservation(input: {
  restaurantId: number;
  data: ReservationInput;
  actor?: SessionUser | null;
}): { reservation: Reservation; assignedTable: string | null } {
  const data = input.data;
  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  const phone = data.phone.trim();
  const today = localDate(0);

  if (name.length < 2) throw badRequest("Indique o nome do titular.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest("Email inválido.");
  if (phone.replace(/\D/g, "").length < 6) throw badRequest("Telefone inválido.");
  if (isPastDate(data.date, today)) throw badRequest("Não é possível reservar para uma data passada.");
  if (isDateTooFar(data.date, today, 60)) throw badRequest("Reservas até 60 dias de antecedência.");
  if (!isWithinService(data.time)) throw badRequest("Hora fora do serviço (12:00–14:30 e 19:00–22:00).");
  if (!Number.isInteger(data.partySize) || data.partySize < 1 || data.partySize > MAX_PARTY_PUBLIC) {
    throw badRequest(`Número de pessoas deve estar entre 1 e ${MAX_PARTY_PUBLIC}.`);
  }
  if ((data.note ?? "").length > 400) throw badRequest("Nota demasiado longa.");

  return transaction(() => {
    let table: { id: number; code: string; seats: number } | null = null;
    if (data.tableId) {
      const requested = get<{ id: number; code: string; seats: number }>(
        "SELECT id, code, seats FROM tables WHERE id=? AND restaurant_id=?",
        data.tableId,
        input.restaurantId,
      );
      if (!requested) throw notFound("Mesa não encontrada");
      if (!fitsParty(requested.seats, data.partySize)) throw conflict(`A mesa ${requested.code} tem apenas ${requested.seats} lugares.`);
      const existing = all<{ id: number; table_id: number | null; time: string; status: string }>(
        `SELECT id,table_id,time,status FROM reservations WHERE restaurant_id=? AND date=? AND status IN ('pending','confirmed','seated')`,
        input.restaurantId,
        data.date,
      );
      const clash = hasTableConflict(existing.map(toInterval), {
        time: data.time,
        tableId: requested.id,
      });
      if (clash) throw conflict(`A mesa ${requested.code} já está reservada perto das ${clash.time}.`);
      table = requested;
    } else {
      table = pickTableForSlot(input.restaurantId, data.date, data.time, data.partySize);
      if (!table) {
        const alternatives = availabilityForDate(input.restaurantId, data.date, data.partySize)
          .filter((s) => s.availableTables > 0 && toMinutes(s.time) >= toMinutes(data.time))
          .slice(0, 3)
          .map((s) => s.time);
        throw conflict(
          alternatives.length
            ? `Sem mesa disponível às ${data.time}. Horas disponíveis: ${alternatives.join(", ")}.`
            : "Sem disponibilidade para esta data. Experimente outro dia.",
        );
      }
    }

    const customerExisting = get<{ id: number }>(
      "SELECT id FROM customers WHERE restaurant_id=? AND lower(email)=lower(?) LIMIT 1",
      input.restaurantId,
      email,
    );
    let customerId: number;
    if (customerExisting) {
      customerId = customerExisting.id;
      run("UPDATE customers SET name=?, phone=? WHERE id=?", name, phone, customerId);
    } else {
      const res = run(
        "INSERT INTO customers (restaurant_id,name,email,phone,notes,created_at) VALUES (?,?,?,?,?,?)",
        input.restaurantId,
        name,
        email,
        phone,
        "",
        nowIso(),
      );
      customerId = Number(res.lastInsertRowid);
    }

    const status: ReservationStatus = input.actor ? "confirmed" : "pending";
    const code = nextReservationCode(input.restaurantId);
    const res = run(
      `INSERT INTO reservations (restaurant_id,code,customer_id,table_id,date,time,party_size,status,note,source,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      input.restaurantId,
      code,
      customerId,
      table.id,
      data.date,
      data.time,
      data.partySize,
      status,
      (data.note ?? "").slice(0, 400),
      data.source ?? (input.actor ? "admin" : "website"),
      nowIso(),
      nowIso(),
    );
    const id = Number(res.lastInsertRowid);

    if (data.date === today) {
      const tableStatus = get<{ status: TableStatus }>("SELECT status FROM tables WHERE id=?", table.id);
      const hasOpenOrder = get<{ id: number }>(
        "SELECT id FROM orders WHERE table_id=? AND status NOT IN ('paid','cancelled') LIMIT 1",
        table.id,
      );
      if (!hasOpenOrder && tableStatus && ["available", "reserved"].includes(tableStatus.status)) {
        run("UPDATE tables SET status='reserved', updated_at=? WHERE id=?", nowIso(), table.id);
      }
    }

    if (input.actor) {
      recordAudit(
        input.actor,
        "reservation.create",
        "reservation",
        id,
        `Reserva ${code} — ${name}, ${data.partySize} pax, ${data.date} ${data.time}, mesa ${table.code}`,
      );
    }

    return { reservation: getReservation(input.restaurantId, id), assignedTable: table.code };
  });
}

const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["seated", "cancelled", "no_show"],
  seated: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function updateReservationStatus(input: {
  restaurantId: number;
  actor: SessionUser;
  reservationId: number;
  status: ReservationStatus;
  note?: string;
}): void {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden("Sem permissão para gerir reservas.");
  transaction(() => {
    const reservation = getReservation(input.restaurantId, input.reservationId);
    if (!ALLOWED_TRANSITIONS[reservation.status].includes(input.status)) {
      throw conflict(`Transição inválida: ${reservation.status} → ${input.status}.`);
    }
    if (input.status === "confirmed" && !reservation.tableId) {
      const table = pickTableForSlot(input.restaurantId, reservation.date, reservation.time, reservation.partySize, reservation.id);
      if (!table) throw conflict("Sem mesa disponível para confirmar esta reserva.");
      run("UPDATE reservations SET table_id=? WHERE id=?", table.id, reservation.id);
    }
    const note = input.note !== undefined ? input.note.slice(0, 400) : reservation.note;
    run(
      "UPDATE reservations SET status=?, note=?, updated_at=? WHERE id=? AND restaurant_id=?",
      input.status,
      note,
      nowIso(),
      reservation.id,
      input.restaurantId,
    );

    if (reservation.tableId) {
      const table = get<{ status: TableStatus }>("SELECT status FROM tables WHERE id=?", reservation.tableId);
      const hasOpenOrder = get<{ id: number }>(
        "SELECT id FROM orders WHERE table_id=? AND status NOT IN ('paid','cancelled') LIMIT 1",
        reservation.tableId,
      );
      if (!hasOpenOrder && table) {
        if (input.status === "seated") {
          run("UPDATE tables SET status='occupied', updated_at=? WHERE id=?", nowIso(), reservation.tableId);
        } else if (["cancelled", "completed", "no_show"].includes(input.status) && table.status === "reserved") {
          run("UPDATE tables SET status='available', updated_at=? WHERE id=?", nowIso(), reservation.tableId);
        }
      }
    }
    recordAudit(
      input.actor,
      "reservation.status",
      "reservation",
      reservation.id,
      `Reserva ${reservation.code}: ${reservation.status} → ${input.status}`,
    );
  });
}

export function assignReservationTable(input: {
  restaurantId: number;
  actor: SessionUser;
  reservationId: number;
  tableId: number;
}): void {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden();
  transaction(() => {
    const reservation = getReservation(input.restaurantId, input.reservationId);
    if (["cancelled", "completed", "no_show"].includes(reservation.status)) throw conflict("Reserva já encerrada.");
    const table = get<{ id: number; code: string; seats: number }>(
      "SELECT id,code,seats FROM tables WHERE id=? AND restaurant_id=?",
      input.tableId,
      input.restaurantId,
    );
    if (!table) throw notFound("Mesa não encontrada");
    if (!fitsParty(table.seats, reservation.partySize)) throw conflict(`A mesa ${table.code} tem apenas ${table.seats} lugares.`);
    const existing = all<{ id: number; table_id: number | null; time: string; status: string }>(
      `SELECT id,table_id,time,status FROM reservations WHERE restaurant_id=? AND date=? AND status IN ('pending','confirmed','seated') AND id <> ?`,
      input.restaurantId,
      reservation.date,
      reservation.id,
    );
    const clash = hasTableConflict(existing.map(toInterval), {
      time: reservation.time,
      tableId: table.id,
      ignoreId: reservation.id,
    });
    if (clash) throw conflict(`Conflito com reserva das ${clash.time} na mesa ${table.code}.`);
    run("UPDATE reservations SET table_id=?, updated_at=? WHERE id=?", table.id, nowIso(), reservation.id);
    recordAudit(
      input.actor,
      "reservation.assign",
      "reservation",
      reservation.id,
      `Reserva ${reservation.code} atribuída à mesa ${table.code}`,
    );
  });
}

export function reservationStats(restaurantId: number, date: string) {
  const rows = all<{ status: ReservationStatus; party_size: number }>(
    "SELECT status, party_size FROM reservations WHERE restaurant_id=? AND date=?",
    restaurantId,
    date,
  );
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    seated: rows.filter((r) => r.status === "seated").length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    noShow: rows.filter((r) => r.status === "no_show").length,
    covers: rows.filter((r) => ["confirmed", "seated", "completed"].includes(r.status)).reduce((s, r) => s + r.party_size, 0),
  };
}

export function publicAvailability(date: string, partySize: number) {
  const restaurant = get<{ id: number }>("SELECT id FROM restaurants ORDER BY id LIMIT 1");
  if (!restaurant) throw notFound();
  if (isPastDate(date, localDate(0))) throw badRequest("Data no passado.");
  if (isDateTooFar(date, localDate(0), 60)) throw badRequest("Data demasiado distante.");
  const slots = availabilityForDate(restaurant.id, date, partySize).filter((s) => s.availableTables > 0);
  return {
    date,
    partySize,
    slots: slots.map((s) => ({ time: s.time, remaining: Math.min(s.availableTables, 6) })),
    nextDates: [0, 1, 2, 3].map((offset) => addDaysToDateString(date, offset)),
  };
}

export { SERVICE_WINDOWS, fromMinutes };
