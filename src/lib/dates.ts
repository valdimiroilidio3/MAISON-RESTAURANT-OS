/** Timezone-aware helpers. Operational timestamps are stored as UTC ISO strings. */

export const RESTAURANT_TZ = "Europe/Lisbon";

export function nowIso(): string {
  return new Date().toISOString();
}

function partsInTz(instant: Date, timeZone = RESTAURANT_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  return map;
}

/** Today's (or offset day's) calendar date in the restaurant timezone. */
export function localDate(offsetDays = 0, timeZone = RESTAURANT_TZ): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const p = partsInTz(d, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localTimeOfDay(timeZone = RESTAURANT_TZ): string {
  const p = partsInTz(new Date(), timeZone);
  return `${p.hour}:${p.minute}`;
}

function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const p = partsInTz(instant, timeZone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/** Convert a wall-clock date+time in the restaurant timezone into a UTC ISO string. */
export function zonedToUtcIso(date: string, time: string, timeZone = RESTAURANT_TZ): string {
  const base = Date.parse(`${date}T${time}:00Z`);
  let guess = base;
  for (let i = 0; i < 3; i++) {
    const offset = tzOffsetMinutes(new Date(guess), timeZone);
    guess = base - offset * 60_000;
  }
  return new Date(guess).toISOString();
}

export function formatTime(iso: string | null, timeZone = RESTAURANT_TZ): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | null, timeZone = RESTAURANT_TZ): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function minutesSince(iso: string | null, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function localDateOf(iso: string | null, timeZone = RESTAURANT_TZ): string {
  if (!iso) return "";
  const p = partsInTz(new Date(iso), timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}
