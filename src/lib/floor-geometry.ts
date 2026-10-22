/**
 * Pure floor-plan maths. No three.js, no React: used by the 3D scene, the 2D
 * plan and the live simulation so seats always line up between all three.
 */

export interface ChairSlot {
  x: number;
  z: number;
  rotation: number;
}

/**
 * Chair seat height, in metres.
 *
 * One number, used by three things that must agree: the chair mesh, the seated
 * characters' hip pivot, and the collision test that keeps a diner's knees under
 * the table instead of inside it.
 */
export const CHAIR_SEAT_HEIGHT = 0.45;

/** Table top height, same contract as the seat height above. */
export const TABLE_HEIGHT = 0.74;

export const ROUND_RADIUS: Record<number, number> = { 1: 0.5, 2: 0.62, 3: 0.72, 4: 0.82, 5: 0.9, 6: 0.98 };

export function tableDimensions(table: { shape: "round" | "rect"; seats: number }): {
  width: number;
  depth: number;
  radius: number;
  height: number;
} {
  if (table.shape === "round") {
    const radius = ROUND_RADIUS[Math.min(6, Math.max(1, table.seats))] ?? 0.82;
    return { width: radius * 2, depth: radius * 2, radius, height: 0.74 };
  }
  const width = table.seats <= 2 ? 1.0 : table.seats <= 4 ? 1.35 : table.seats <= 6 ? 2.0 : 2.7;
  return { width, depth: 0.95, radius: 0, height: 0.74 };
}

/**
 * Seat positions around a table in world coordinates, all facing the centre.
 *
 * `seatOffset` is the distance from the table edge to the seat centre; the
 * default (0.36 m round / 0.40 m rect) is the depth a chair is tucked in, which
 * keeps neighbouring tables from sharing chair space. `yaw` rotates the seats
 * around a round table — the placement solver uses it to find the orientation
 * with the most clearance (see `src/lib/scene/placement.ts`).
 */
export function chairSlots(
  table: { shape: "round" | "rect"; seats: number; x: number; z: number; rotation: number },
  id = 0,
  options: { seatOffset?: number; yaw?: number } = {},
): ChairSlot[] {
  const dims = tableDimensions(table);
  const slots: ChairSlot[] = [];
  const rotation = table.rotation ?? 0;
  if (table.shape === "round") {
    const radius = dims.radius + (options.seatOffset ?? 0.36);
    const offset = options.yaw ?? (id % 4) * 0.22;
    for (let i = 0; i < table.seats; i++) {
      const angle = (i / table.seats) * Math.PI * 2 + offset;
      const dx = Math.cos(angle) * radius;
      const dz = Math.sin(angle) * radius;
      slots.push({ x: dx, z: dz, rotation: Math.atan2(dx, dz) + Math.PI });
    }
  } else {
    const perSide = Math.ceil(table.seats / 2);
    const usable = dims.width - 0.55;
    const reach = dims.depth / 2 + (options.seatOffset ?? 0.4);
    for (let i = 0; i < perSide; i++) {
      const offset = perSide === 1 ? 0 : -usable / 2 + (i * usable) / (perSide - 1);
      slots.push({ x: offset, z: reach, rotation: Math.PI });
      if (slots.length < table.seats) slots.push({ x: offset, z: -reach, rotation: 0 });
    }
  }
  return slots.map((slot) => {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return {
      x: table.x + slot.x * cos + slot.z * sin,
      z: table.z - slot.x * sin + slot.z * cos,
      rotation: slot.rotation + rotation,
    };
  });
}
