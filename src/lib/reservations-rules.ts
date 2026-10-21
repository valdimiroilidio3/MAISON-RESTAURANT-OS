/**
 * Reservation rules — pure functions shared by public booking, admin assignment
 * and tests. Times are local wall-clock strings "HH:MM". A reservation occupies
 * its table for `TURN_MINUTES` (90 by default), which is how overlapping
 * bookings are detected.
 */

export const TURN_MINUTES = 90;
export const SLOT_MINUTES = 30;

export interface ServiceWindow {
  start: string;
  end: string;
}

/** Lunch and dinner services, last seating one turn before close. */
export const SERVICE_WINDOWS: ServiceWindow[] = [
  { start: "12:00", end: "14:30" },
  { start: "19:00", end: "22:00" },
];

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isWithinService(time: string, windows: ServiceWindow[] = SERVICE_WINDOWS): boolean {
  const t = toMinutes(time);
  return windows.some((w) => t >= toMinutes(w.start) && t <= toMinutes(w.end));
}

export function generateSlots(windows: ServiceWindow[] = SERVICE_WINDOWS, step = SLOT_MINUTES): string[] {
  const slots: string[] = [];
  for (const w of windows) {
    for (let t = toMinutes(w.start); t <= toMinutes(w.end); t += step) {
      slots.push(fromMinutes(t));
    }
  }
  return slots;
}

export interface BookingInterval {
  id?: number;
  time: string;
  durationMinutes?: number;
  tableId: number | null;
  status: string;
  partySize?: number;
}

export const INACTIVE_RESERVATION_STATUSES = new Set(["cancelled", "no_show", "completed"]);

export function intervalOf(time: string, durationMinutes = TURN_MINUTES): { start: number; end: number } {
  const start = toMinutes(time);
  return { start, end: start + durationMinutes };
}

export function intervalsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/** A candidate is blocked when another active booking on the same table overlaps. */
export function hasTableConflict(
  existing: BookingInterval[],
  candidate: { time: string; tableId: number | null; durationMinutes?: number; ignoreId?: number },
): BookingInterval | null {
  if (candidate.tableId == null) return null;
  const candidateInterval = intervalOf(candidate.time, candidate.durationMinutes ?? TURN_MINUTES);
  for (const booking of existing) {
    if (booking.tableId !== candidate.tableId) continue;
    if (INACTIVE_RESERVATION_STATUSES.has(booking.status)) continue;
    if (candidate.ignoreId != null && booking.id === candidate.ignoreId) continue;
    if (intervalsOverlap(candidateInterval, intervalOf(booking.time, booking.durationMinutes ?? TURN_MINUTES))) {
      return booking;
    }
  }
  return null;
}

export function fitsParty(seats: number, partySize: number): boolean {
  return seats >= partySize;
}

/** Human-friendly next-bookable date, used by the public widget. */
export function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function isPastDate(date: string, today: string): boolean {
  return date < today;
}

export function isDateTooFar(date: string, today: string, horizonDays = 60): boolean {
  return date > addDaysToDateString(today, horizonDays);
}

export function formatDatePT(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateLongPT(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
