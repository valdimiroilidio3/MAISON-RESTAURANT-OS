import type { TableStatus } from "@/lib/types";

export interface SceneTable {
  id: number;
  code: string;
  seats: number;
  shape: "round" | "rect";
  x: number;
  z: number;
  rotation: number;
  zoneSlug: string;
  zoneName: string;
  /** Only present in operations mode — the public preview never receives status. */
  status?: TableStatus;
  guests?: number;
  orderNumber?: number;
  reservedTime?: string;
}

export interface SceneZone {
  id: number;
  name: string;
  slug: string;
}

export interface ChairSlot {
  x: number;
  z: number;
  rotation: number;
}

/*
 * Geometry helpers live in `@/lib/floor-geometry` so the simulation engine,
 * tests and the 3D scene all compute chair positions from the same source.
 */
export { chairSlots, tableDimensions, ROUND_RADIUS } from "@/lib/floor-geometry";
