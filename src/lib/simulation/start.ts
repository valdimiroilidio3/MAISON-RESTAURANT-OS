/**
 * Where the live simulation should start: the real wall clock of the
 * restaurant (Europe/Lisbon), so the room is in whatever service window — or
 * closed period — the guest is actually in. Pure so it can be unit tested.
 */

import { localDate, localTimeOfDay, RESTAURANT_TZ } from "@/lib/dates";

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface SimulationStart {
  weekday: number;
  startMinutes: number;
  startDate: string;
  seed: number;
}

export function simulationStart(instant = new Date()): SimulationStart {
  const key = new Intl.DateTimeFormat("en-US", { timeZone: RESTAURANT_TZ, weekday: "short" }).format(instant);
  const weekday = WEEKDAY_INDEX[key] ?? 0;
  const [hour, minute] = localTimeOfDay().split(":").map(Number);
  const startMinutes = (Number.isFinite(hour) ? hour : 12) * 60 + (Number.isFinite(minute) ? minute : 0);
  const startDate = localDate();
  const seed = Number(startDate.replace(/-/g, "")) % 100_000;
  return { weekday, startMinutes, startDate, seed };
}
