/**
 * THE room. One authoritative spatial description of the MAISON dining floor,
 * consumed by the 3D world, the 2D plan, the simulation navigation grid, the
 * camera framing and the validator.
 *
 * Rules
 *  - Every dimension below is a *design* value for this demonstration, not a
 *    surveyed measurement. They are centralised here so they can be replaced in
 *    one place.
 *  - Units are metres. World axes: +X east (glass facade), +Z south (terrace
 *    rail / entrance), +Y up. Floor of the dining room is y = 0.
 *  - Partitions are defined once, with the openings cut out of them. Renderers
 *    build walls from `PARTITIONS`, never from their own coordinates.
 */

import { chairSlots, tableDimensions } from "@/lib/floor-geometry";
import type { Circle, Obb, Rect } from "./spatial";

export interface TableLike {
  id: number;
  code: string;
  seats: number;
  shape: "round" | "rect";
  x: number;
  z: number;
  rotation: number;
}

/* ------------------------------------------------------------------ levels */

export const FLOOR_LEVEL = {
  interior: 0,
  /** The terrace deck sits one small step below the interior floor. */
  terrace: -0.02,
  threshold: 0.012,
};

export const WALL = {
  height: 3.35,
  thickness: 0.22,
  glassThickness: 0.06,
  /** Perimeter soffit: the room is a cutaway — a ceiling band, no slab. */
  soffitDepth: 0.62,
  beamHeight: 3.16,
};

/* ------------------------------------------------------------------ bounds */

/** Every walkable surface (interior + terrace). */
export const ROOM_BOUNDS: Rect = { minX: -11.4, maxX: 9.6, minZ: -7.9, maxZ: 8.8 };
/** Enclosed dining room. */
export const INTERIOR: Rect = { minX: -4.8, maxX: 9.6, minZ: -7.8, maxZ: 8.8 };
/** Open-air terrace, west of the glass partition. */
export const TERRACE: Rect = { minX: -11.4, maxX: -4.8, minZ: -7.9, maxZ: 8.8 };

export const ZONE_BOUNDS: Record<"esplanada" | "sala" | "balcao", Rect> = {
  esplanada: TERRACE,
  sala: { minX: -4.8, maxX: 2.6, minZ: -7.8, maxZ: 8.8 },
  balcao: { minX: 2.6, maxX: 9.6, minZ: -7.8, maxZ: 8.8 },
};

/* -------------------------------------------------------------- partitions */

export type WallAxis = "x" | "z";

export interface WallRun {
  id: string;
  /** Axis the wall runs along. "z" = wall plane is x = at. */
  axis: WallAxis;
  /** Coordinate of the wall plane. */
  at: number;
  from: number;
  to: number;
  material: "solid" | "glass";
  height: number;
  thickness: number;
}

export interface Opening {
  id: string;
  /** Opening in a wall running along `axis`. */
  axis: WallAxis;
  at: number;
  from: number;
  to: number;
  sill: number;
  head: number;
  kind: "door" | "pass" | "entrance";
  /** Clear floor distance that must stay free in front of the opening. */
  clearance: number;
  /**
   * Which side of the wall must stay clear: "positive" = +axis side,
   * "negative" = −axis side, "both" = a passage used from both rooms.
   */
  side: "positive" | "negative" | "both";
}

/** West partition (interior ↔ terrace): glass, with the terrace door. */
export const WEST_DOOR = { from: 0.8, to: 2.4 };
/** Back wall: WC door + kitchen pass. */
export const WC_DOOR = { from: -4.32, to: -3.42 };
export const PASS_OPENING = { from: -1.1, to: 3.0 };
/** South wall: the guest entrance (the east facade starts at 9.6). */
export const ENTRANCE = { from: 7.6, to: 9.2 };

export const PARTITIONS: WallRun[] = [
  // west glass screen
  { id: "west-north", axis: "z", at: -4.8, from: ROOM_BOUNDS.minZ, to: WEST_DOOR.from, material: "glass", height: 3.2, thickness: WALL.glassThickness },
  { id: "west-south", axis: "z", at: -4.8, from: WEST_DOOR.to, to: INTERIOR.maxZ, material: "glass", height: 3.2, thickness: WALL.glassThickness },
  // back wall (north)
  { id: "back-west", axis: "x", at: INTERIOR.minZ, from: INTERIOR.minX, to: WC_DOOR.from, material: "solid", height: WALL.height, thickness: WALL.thickness },
  { id: "back-centre", axis: "x", at: INTERIOR.minZ, from: WC_DOOR.to, to: PASS_OPENING.from, material: "solid", height: WALL.height, thickness: WALL.thickness },
  { id: "back-east", axis: "x", at: INTERIOR.minZ, from: PASS_OPENING.to, to: INTERIOR.maxX, material: "solid", height: WALL.height, thickness: WALL.thickness },
  // south wall (entrance side)
  { id: "south-west", axis: "x", at: INTERIOR.maxZ, from: INTERIOR.minX, to: ENTRANCE.from, material: "glass", height: 3.2, thickness: WALL.glassThickness },
  { id: "south-east", axis: "x", at: INTERIOR.maxZ, from: ENTRANCE.to, to: INTERIOR.maxX, material: "glass", height: 3.2, thickness: WALL.glassThickness },
  // east facade (street), fully glazed
  { id: "east", axis: "z", at: INTERIOR.maxX, from: INTERIOR.minZ, to: INTERIOR.maxZ, material: "glass", height: 3.2, thickness: WALL.glassThickness },
];

export const OPENINGS: Opening[] = [
  { id: "terrace-door", axis: "z", at: -4.8, from: WEST_DOOR.from, to: WEST_DOOR.to, sill: 0, head: 2.55, kind: "door", clearance: 1.15, side: "both" },
  { id: "wc-door", axis: "x", at: INTERIOR.minZ, from: WC_DOOR.from, to: WC_DOOR.to, sill: 0, head: 2.15, kind: "door", clearance: 0.95, side: "positive" },
  { id: "pass", axis: "x", at: INTERIOR.minZ, from: PASS_OPENING.from, to: PASS_OPENING.to, sill: 1.05, head: WALL.height, kind: "pass", clearance: 1.1, side: "positive" },
  { id: "entrance", axis: "x", at: INTERIOR.maxZ, from: ENTRANCE.from, to: ENTRANCE.to, sill: 0, head: 2.6, kind: "entrance", clearance: 1.3, side: "negative" },
];

/**
 * The kitchen wing: a service room behind the back wall, reached through the
 * pass. It used to be derived inside the 3D shell, which made it the fifth
 * independent definition of the room. It belongs to the plan.
 */
export const KITCHEN: Rect = {
  minX: PASS_OPENING.from - 1.2,
  maxX: PASS_OPENING.to + 2.0,
  minZ: INTERIOR.minZ - 1.75,
  maxZ: INTERIOR.minZ,
};

/* ---------------------------------------------------------------- fixtures */

export type FixtureKind = "counter" | "desk" | "planter" | "pot" | "pass" | "kitchen";

export interface Fixture {
  id: string;
  kind: FixtureKind;
  /** Axis-aligned footprint on the floor. */
  footprint: Rect;
  height: number;
  /** False for decorative items that are low enough to walk past. */
  blocksCirculation: boolean;
  label: string;
}

const rect = (minX: number, minZ: number, maxX: number, maxZ: number): Rect => ({ minX, minZ, maxX, maxZ });

/**
 * Fixed furniture. The bar sits in the north-east corner, the pass is open to
 * the kitchen through the back wall, planters line the glazed edges.
 */
export const FIXTURES: Fixture[] = [
  { id: "bar-counter", kind: "counter", footprint: rect(3.3, -5.46, 8.7, -4.84), height: 1.03, blocksCirculation: true, label: "Balcão" },
  { id: "bar-back", kind: "counter", footprint: rect(3.3, -7.78, 9.3, -7.44), height: 2.6, blocksCirculation: true, label: "Garrafeira" },
  { id: "pass-counter", kind: "pass", footprint: rect(-1.1, -7.9, 3.0, -7.42), height: 1.06, blocksCirculation: true, label: "Pass" },
  { id: "host-desk", kind: "desk", footprint: rect(6.62, 6.32, 7.48, 6.82), height: 1.05, blocksCirculation: true, label: "Receção" },
  // interior glazed edge — east
  { id: "planter-east-s", kind: "planter", footprint: rect(9.06, 4.2, 9.58, 7.4), height: 0.9, blocksCirculation: true, label: "Planta (sala)" },
  { id: "planter-east-n", kind: "planter", footprint: rect(9.06, -3.1, 9.58, -0.7), height: 0.9, blocksCirculation: true, label: "Planta (sala)" },
  // interior glazed edge — west partition
  { id: "planter-west-s", kind: "planter", footprint: rect(-4.74, 3.4, -4.28, 5.8), height: 0.9, blocksCirculation: true, label: "Planta (sala)" },
  { id: "planter-west-n", kind: "planter", footprint: rect(-4.74, -2.1, -4.28, 0.1), height: 0.9, blocksCirculation: true, label: "Planta (sala)" },
  // terrace edge
  { id: "planter-terrace", kind: "planter", footprint: rect(-8.7, 7.66, -4.9, 8.12), height: 0.9, blocksCirculation: true, label: "Planta (esplanada)" },
  { id: "planter-terrace-n", kind: "planter", footprint: rect(-11.2, -7.86, -5.3, -7.46), height: 0.9, blocksCirculation: true, label: "Planta (esplanada)" },
];

/** Round pots that are low enough to brush past but still block a walking line. */
export const POTS: Array<{ id: string; x: number; z: number; r: number }> = [
  { id: "pot-terrace-s", x: -10.86, z: 6.9, r: 0.34 },
  { id: "pot-entry", x: 6.9, z: 8.18, r: 0.32 },
  { id: "pot-balc", x: 3.0, z: 8.18, r: 0.32 },
  { id: "pot-wc", x: -4.6, z: -6.3, r: 0.3 },
  { id: "pot-pass", x: 4.3, z: -7.15, r: 0.3 },
];

/* --------------------------------------------------------------- landmarks */

export const LANDMARKS = {
  /** Inside the entrance, where guests appear. */
  door: { x: 8.4, z: 8.1 },
  /** Host stand (behind the desk, facing the room). */
  host: { x: 7.05, z: 5.75 },
  /** Customer side of the bar, used to settle the bill at the counter. */
  counter: { x: 6.9, z: -3.4 },
  /** Dining-room side of the kitchen pass. */
  pass: { x: 2.9, z: -7.1 },
  /** Just outside the WC door. */
  bathroom: { x: -3.87, z: -7.15 },
  /** Back of house — staff only, outside the walkable grid. */
  kitchen: { x: 2.4, z: -8.45 },
} as const;

/* ---------------------------------------------------------------- parasols */

/**
 * Parasols are anchored to four terrace tables. The pole passes through the
 * table centre (a standard umbrella hole), so it can never block a walkway or
 * intersect a chair. Canopies are sized to keep 0.3 m between neighbours.
 */
export interface Parasol {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  /** Table code the umbrella belongs to (for the renderer to skip a candle). */
  tableCode: string;
}

export const PARASOLS: Parasol[] = [
  { id: "p-t01", x: -9.4, z: -5.6, radius: 1.25, height: 2.6, tableCode: "T01" },
  { id: "p-t03", x: -9.4, z: -2.8, radius: 1.25, height: 2.6, tableCode: "T03" },
  { id: "p-t05", x: -9.2, z: 0.1, radius: 1.25, height: 2.6, tableCode: "T05" },
  { id: "p-t20", x: -9.3, z: 3.4, radius: 1.25, height: 2.6, tableCode: "T20" },
];

/* ----------------------------------------------------------------- lights */

export const PRACTICALS = {
  chandeliers: [
    { x: -2.2, y: 2.78, z: -3.4 },
    { x: -0.6, y: 2.82, z: 3.4 },
    { x: 6.4, y: 2.86, z: -1.2 },
  ],
  /** Wall sconces, derived from the wall runs. */
  sconces: [
    { x: 9.5, y: 2.0, z: -3.4, rotation: -Math.PI / 2 },
    { x: 9.5, y: 2.0, z: 2.6, rotation: -Math.PI / 2 },
    { x: 9.5, y: 2.0, z: 7.4, rotation: -Math.PI / 2 },
    { x: -4.7, y: 2.0, z: -5.6, rotation: Math.PI / 2 },
    { x: -4.7, y: 2.0, z: 5.4, rotation: Math.PI / 2 },
    { x: 0.2, y: 2.35, z: -7.66, rotation: 0 },
    { x: 4.2, y: 2.35, z: -7.66, rotation: 0 },
  ],
  barLight: { x: 6.3, y: 2.1, z: -6.9 },
  passLight: { x: 1.35, y: 2.5, z: -8.2 },
};

/* -------------------------------------------------------------- geometry */

/** Tabletop footprint (no chairs). */
export function tableObb(table: TableLike): Obb {
  const dims = tableDimensions(table);
  const half = table.shape === "round" ? dims.radius : dims.width / 2;
  return { x: table.x, z: table.z, hw: half, hd: table.shape === "round" ? dims.radius : dims.depth / 2, rotation: table.rotation };
}

/** Seat positions in world space (single source: floor-geometry). */
export function seatPositions(table: TableLike): ReturnType<typeof chairSlots> {
  return chairSlots(table, table.id);
}

/** Chair footprint as a circle around the seat centre (seat + backrest depth). */
export function chairCircle(table: TableLike, index: number): Circle {
  const seat = seatPositions(table)[index];
  return { x: seat.x, z: seat.z, r: 0.27 };
}

/** Conservative circle enclosing the table and its chairs. */
export function tableGroupCircle(table: TableLike): Circle {
  const dims = tableDimensions(table);
  const reach = table.shape === "round" ? dims.radius : Math.hypot(dims.width / 2, dims.depth / 2);
  // chairs sit `seatOffset` outside the table edge
  return { x: table.x, z: table.z, r: reach + 0.4 + 0.27 };
}

/** Returned by the validator; kept here so renderers can shrink a table label. */
export function hasParasol(table: TableLike): Parasol | undefined {
  return PARASOLS.find((p) => p.tableCode === table.code);
}

/** Axis-aligned footprint of every wall run (openings are already cut out). */
export function wallFootprints(): Array<{ id: string; rect: Rect; material: WallRun["material"] }> {
  return PARTITIONS.map((wall) => {
    const half = wall.thickness / 2;
    return {
      id: wall.id,
      material: wall.material,
      rect:
        wall.axis === "z"
          ? { minX: wall.at - half, maxX: wall.at + half, minZ: wall.from, maxZ: wall.to }
          : { minX: wall.from, maxX: wall.to, minZ: wall.at - half, maxZ: wall.at + half },
    };
  });
}

/** Clear floor rectangle an opening needs on the side(s) it is used from. */
export function openingClearance(opening: Opening, distance = opening.clearance): Rect {
  const near = WALL.thickness / 2 + 0.02;
  const from = opening.side === "positive" ? near : distance;
  const to = opening.side === "negative" ? near : distance;
  return opening.axis === "z"
    ? { minX: opening.at - to, maxX: opening.at + from, minZ: opening.from, maxZ: opening.to }
    : { minX: opening.from, maxX: opening.to, minZ: opening.at - to, maxZ: opening.at + from };
}

/** Zone slug for a point, used by camera presets and the 2D plan. */
export function zoneAt(x: number, z: number): "esplanada" | "sala" | "balcao" {
  if (x < INTERIOR.minX) return "esplanada";
  return x < 2.6 ? "sala" : "balcao";
}

/* ------------------------------------------------------------- table plan */

export interface TablePlanEntry {
  code: string;
  zone: "esplanada" | "sala" | "balcao";
  seats: number;
  shape: "round" | "rect";
  x: number;
  z: number;
  rotation: number;
}

/**
 * The seeded floor plan — the authoritative table placement. `seed.ts` inserts
 * it and `db.ts` reconciles an existing database against it, so the 3D scene,
 * the 2D plan, the simulation and the database can never drift apart.
 */
export const TABLE_PLAN: TablePlanEntry[] = [
  { code: "T01", zone: "esplanada", seats: 2, shape: "round", x: -9.4, z: -5.6, rotation: 0 },
  { code: "T02", zone: "esplanada", seats: 2, shape: "round", x: -6.8, z: -5.6, rotation: 0 },
  { code: "T03", zone: "esplanada", seats: 4, shape: "round", x: -9.4, z: -2.8, rotation: 0 },
  { code: "T04", zone: "esplanada", seats: 4, shape: "round", x: -6.6, z: -2.8, rotation: 0 },
  { code: "T05", zone: "esplanada", seats: 4, shape: "rect", x: -9.2, z: 0.1, rotation: 0 },
  { code: "T06", zone: "esplanada", seats: 4, shape: "rect", x: -6.9, z: 0.2, rotation: 0 },
  { code: "T20", zone: "esplanada", seats: 2, shape: "round", x: -9.3, z: 3.4, rotation: 0 },
  { code: "T07", zone: "sala", seats: 6, shape: "rect", x: -2.6, z: -3.6, rotation: 0 },
  { code: "T08", zone: "sala", seats: 4, shape: "rect", x: 0.5, z: -3.6, rotation: 0 },
  { code: "T09", zone: "sala", seats: 4, shape: "round", x: -2.6, z: -0.4, rotation: 0 },
  { code: "T10", zone: "sala", seats: 2, shape: "round", x: 0.7, z: -0.4, rotation: 0 },
  { code: "T11", zone: "sala", seats: 2, shape: "round", x: -2.6, z: 2.7, rotation: 0 },
  { code: "T12", zone: "sala", seats: 6, shape: "rect", x: 0.3, z: 3.3, rotation: 0 },
  { code: "T13", zone: "balcao", seats: 4, shape: "round", x: 4.0, z: -2.5, rotation: 0 },
  { code: "T14", zone: "balcao", seats: 8, shape: "rect", x: 5.7, z: -0.2, rotation: 0 },
  { code: "T15", zone: "balcao", seats: 2, shape: "round", x: 3.4, z: 1.5, rotation: 0 },
  { code: "T16", zone: "balcao", seats: 2, shape: "round", x: 6.7, z: 1.9, rotation: 0 },
  { code: "T17", zone: "balcao", seats: 2, shape: "round", x: 4.2, z: 4.3, rotation: 0 },
  { code: "T18", zone: "balcao", seats: 4, shape: "rect", x: 6.7, z: 4.6, rotation: 0 },
  { code: "T19", zone: "balcao", seats: 4, shape: "round", x: 3.3, z: 6.4, rotation: 0 },
];

/**
 * The plan as renderable tables with stable numeric ids. Ids are the plan
 * index + 1, which is also the insertion order used by `seed.ts`, so the 3D
 * scene, the 2D plan and the simulation agree on every seat without a DB read.
 */
export type PlanTable = TableLike & { zone: TablePlanEntry["zone"] };

export const TABLES: PlanTable[] = TABLE_PLAN.map((entry, index) => ({ ...entry, id: index + 1 }));

