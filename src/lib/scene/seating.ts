/**
 * Seating intelligence.
 *
 * Which table a party gets is a spatial question, not a database question. The
 * first-come `ORDER BY seats` allocator put a couple at the smallest table
 * anywhere in the room — next to the pass, under the speaker, at the door — and
 * left the six-tops empty for the walk-in that needed them.
 *
 * This module scores every table that can hold the party on five axes that a
 * maître d' actually weighs, and returns the ranking with the reason attached:
 *
 *   fit        a 2-top for 2, a 4-top for 4; oversized tables cost real covers
 *   ambience   distance from the bar, the pass and the entrance (people come to
 *              eat, not to hear the pass bell)
 *   view       proximity to the glazing / the terrace, i.e. daylight
 *   access     how easy the table is to reach with a tray or a pushchair
 *   comfort    the narrowest gap between its chairs and its neighbours
 *
 * Pure — the same inputs always produce the same ranking, which is what makes a
 * "suggested table" defensible and testable.
 */

import { chairSlots, tableDimensions } from "@/lib/floor-geometry";
import { computeSeatPlan, type SeatPlan } from "./placement";
import {
  LANDMARKS,
  TABLES,
  ZONE_BOUNDS,
  type PlanTable,
  type TableLike,
} from "./layout";

export type ZoneSlug = PlanTable["zone"];

export const ZONE_LABEL: Record<ZoneSlug, string> = {
  esplanada: "esplanada",
  sala: "sala",
  balcao: "balcão",
};

export interface SeatingCandidate extends TableLike {
  /** Zone as stored in the database ("esplanada" | "sala" | "balcao" | anything). */
  zone?: string;
  code: string;
}

export interface SeatingPreferences {
  /** Guest asked for a zone. */
  zone?: ZoneSlug | null;
  /** Prefers the glass / the terrace. */
  view?: boolean;
  /** Prefers distance from the bar, pass and entrance. */
  quiet?: boolean;
  /** Needs a step-free, wide approach (pushchair, wheelchair, elderly guest). */
  accessible?: boolean;
}

export interface ScoredTable {
  table: SeatingCandidate;
  /** 0–100, higher is better. */
  score: number;
  /** Human-readable reasons, strongest first. */
  reasons: string[];
  breakdown: {
    fit: number;
    ambience: number;
    view: number;
    access: number;
    comfort: number;
  };
}

const WEIGHTS = { fit: 0.34, ambience: 0.18, view: 0.16, access: 0.16, comfort: 0.16 };

/** Points of interest the room's quality is measured against. */
const NOISE = [
  { id: "bar", ...LANDMARKS.counter, radius: 3.2, weight: 1 },
  { id: "pass", ...LANDMARKS.pass, radius: 2.6, weight: 1.1 },
  { id: "door", ...LANDMARKS.door, radius: 2.8, weight: 0.8 },
  { id: "host", ...LANDMARKS.host, radius: 1.6, weight: 0.35 },
] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** 1 at `near`, 0 at `far`, linear in between. */
function ramp(distance: number, near: number, far: number) {
  if (far <= near) return distance <= near ? 1 : 0;
  return clamp01(1 - (distance - near) / (far - near));
}

/** How much light a table gets: the two glazed edges plus the terrace itself. */
export function daylightAt(x: number, z: number): number {
  const toEast = Math.abs(ZONE_BOUNDS.balcao.maxX - x);
  const toTerrace = Math.max(0, x - ZONE_BOUNDS.esplanada.maxX);
  const onTerrace = x < ZONE_BOUNDS.esplanada.maxX;
  if (onTerrace) return 1;
  return clamp01(ramp(toEast, 0.6, 6.2) * 0.85 + ramp(toTerrace, 0.6, 7.5) * 0.55);
}

/**
 * How exposed a table is to the noisy parts of the room.
 *
 * Deliberately *not* normalised by the number of sources: the scale is "how many
 * rooms' worth of noise reach this table", so 1.0 means you can hear the bar,
 * the pass and the door, and 0.05 means the far corner of the terrace. A
 * normalised score compresses that range and makes the quiet axis meaningless.
 */
export function exposureAt(x: number, z: number): number {
  let exposure = 0;
  for (const source of NOISE) {
    const distance = Math.hypot(x - source.x, z - source.z);
    exposure += source.weight * ramp(distance, source.radius * 0.35, source.radius * 2.1);
  }
  return exposure;
}

/** Smallest clear distance from a table's chairs to its nearest neighbour's. */
export function neighbourClearance(table: TableLike, all: TableLike[], plan?: SeatPlan): number {
  const seats = chairSlots(table, table.id, { seatOffset: table.shape === "round" ? 0.36 : 0.4, yaw: plan?.get(table.id) ?? 0 });
  let best = Infinity;
  for (const other of all) {
    if (other.id === table.id) continue;
    const otherSeats = chairSlots(other, other.id, {
      seatOffset: other.shape === "round" ? 0.36 : 0.4,
      yaw: plan?.get(other.id) ?? 0,
    });
    for (const a of seats) {
      for (const b of otherSeats) {
        const gap = Math.hypot(a.x - b.x, a.z - b.z) - 0.52;
        if (gap < best) best = gap;
      }
    }
  }
  return best === Infinity ? 4 : best;
}

/** Straight-line walk from the entrance, used as a proxy for "easy to reach". */
export function accessDistance(table: TableLike): number {
  return Math.hypot(table.x - LANDMARKS.door.x, table.z - LANDMARKS.door.z);
}

export function scoreTable(
  table: SeatingCandidate,
  partySize: number,
  options: {
    preferences?: SeatingPreferences;
    all?: TableLike[];
    seatPlan?: SeatPlan;
  } = {},
): ScoredTable {
  const preferences = options.preferences ?? {};
  const all = options.all ?? TABLES;
  const seatPlan = options.seatPlan ?? computeSeatPlan(all);
  // `tableDimensions` is imported for the seat geometry contract; the fit axis
  // itself only needs the seat count.
  void tableDimensions;

  /* fit — a table should be used, not wasted */
  const spare = table.seats - partySize;
  const fit = spare < 0 ? 0 : clamp01(1 - spare / 4);

  /* ambience — quiet beats busy, unless the guest asked otherwise */
  const exposure = exposureAt(table.x, table.z);
  const ambience = clamp01(1 - exposure * (preferences.quiet ? 0.85 : 0.5));

  /* view — the room's best asset is its glazing */
  const daylight = daylightAt(table.x, table.z);
  const view = clamp01(daylight * (preferences.view ? 1.2 : 0.78));

  /* access — tray-carrying distance from the entrance */
  const access = clamp01(1 - accessDistance(table) / 22);

  /* comfort — can two guests stand up at once? */
  const clearance = neighbourClearance(table, all, seatPlan);
  const comfort = clamp01(clearance / 1.1);

  const score =
    100 *
    (WEIGHTS.fit * fit +
      WEIGHTS.ambience * ambience +
      WEIGHTS.view * view +
      WEIGHTS.access * access +
      WEIGHTS.comfort * comfort);

  // The guest's expressed zone is a preference, not a suggestion: it outweighs
  // every soft axis, but a table that does not fit the party is never returned.
  const zoneMatches = !preferences.zone || table.zone === preferences.zone;
  const finalScore = zoneMatches ? score : score * 0.55;

  /* --------------------------------------------------------------- reasons */
  // Reasons are generated from the scored axes, strongest first, so the sentence
  // shown to the guest always matches the number that produced it.
  const reasons: { weight: number; text: string }[] = [];
  if (preferences.zone && zoneMatches) {
    reasons.push({ weight: 1.2, text: `Na zona pedida (${ZONE_LABEL[table.zone as ZoneSlug] ?? table.zone})` });
  }
  if (spare === 0) reasons.push({ weight: fit, text: "Ocupa exactamente os lugares do grupo" });
  else if (spare === 1) reasons.push({ weight: fit, text: "Um lugar livre para conforto" });
  else if (spare >= 3) reasons.push({ weight: fit * 0.6, text: `Mesa de ${table.seats} lugares, com espaço de sobra` });

  if (exposure < 0.18) {
    reasons.push({ weight: ambience, text: "Longe do balcão, do pass e da entrada" });
  }
  if (daylight > 0.72) {
    reasons.push({ weight: view, text: table.zone === "esplanada" ? "Na esplanada, ao ar livre" : "Junto à fachada envidraçada" });
  } else if (daylight > 0.45) {
    reasons.push({ weight: view * 0.8, text: "Com luz natural da fachada" });
  }
  if (preferences.accessible && access > 0.55) {
    reasons.push({ weight: access, text: "Caminho curto e desimpedido desde a entrada" });
  }
  if (clearance > 0.8) {
    reasons.push({ weight: comfort, text: "Espaço livre à volta da mesa" });
  }
  if (reasons.length === 0) {
    reasons.push({ weight: 0, text: `Mesa de ${table.seats} lugares em ${ZONE_LABEL[table.zone as ZoneSlug] ?? "sala"}` });
  }

  const top = reasons
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((reason) => reason.text);

  return {
    table,
    score: Math.round(finalScore * 10) / 10,
    reasons: top,
    breakdown: {
      fit: Math.round(fit * 100),
      ambience: Math.round(ambience * 100),
      view: Math.round(view * 100),
      access: Math.round(access * 100),
      comfort: Math.round(comfort * 100),
    },
  };
}

/**
 * Rank the tables that can host the party.
 *
 * `unavailable` are table ids already taken for the slot — they are filtered out
 * before scoring, never scored and then discarded, so the reasons always refer
 * to a table the guest can actually have.
 */
export function rankTables(
  candidates: SeatingCandidate[],
  partySize: number,
  options: {
    preferences?: SeatingPreferences;
    unavailable?: Iterable<number>;
    all?: TableLike[];
    seatPlan?: SeatPlan;
  } = {},
): ScoredTable[] {
  const taken = new Set(options.unavailable ?? []);
  const all = options.all ?? candidates;
  const seatPlan = options.seatPlan ?? computeSeatPlan(all);
  return candidates
    .filter((table) => table.seats >= partySize && !taken.has(table.id))
    .map((table) => scoreTable(table, partySize, { preferences: options.preferences, all, seatPlan }))
    .sort((a, b) => b.score - a.score || a.table.code.localeCompare(b.table.code));
}

/** Convenience for the UI: the best table and its explanation, or null. */
export function suggestTable(
  candidates: SeatingCandidate[],
  partySize: number,
  options: Parameters<typeof rankTables>[2] = {},
): ScoredTable | null {
  return rankTables(candidates, partySize, options)[0] ?? null;
}
