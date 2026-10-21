/**
 * Pure floor-plan maths. No three.js, no React: used by the 3D scene, the 2D
 * plan and the live simulation so seats always line up between all three.
 */

export interface ChairSlot {
  x: number;
  z: number;
  rotation: number;
}

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

/** Seat positions around a table in world coordinates, all facing the centre. */
export function chairSlots(
  table: { shape: "round" | "rect"; seats: number; x: number; z: number; rotation: number },
  id = 0,
): ChairSlot[] {
  const dims = tableDimensions(table);
  const slots: ChairSlot[] = [];
  const rotation = table.rotation ?? 0;
  if (table.shape === "round") {
    const radius = dims.radius + 0.58;
    const offset = (id % 4) * 0.22;
    for (let i = 0; i < table.seats; i++) {
      const angle = (i / table.seats) * Math.PI * 2 + offset;
      const dx = Math.cos(angle) * radius;
      const dz = Math.sin(angle) * radius;
      slots.push({ x: dx, z: dz, rotation: Math.atan2(dx, dz) + Math.PI });
    }
  } else {
    const perSide = Math.ceil(table.seats / 2);
    const usable = dims.width - 0.55;
    for (let i = 0; i < perSide; i++) {
      const offset = perSide === 1 ? 0 : -usable / 2 + (i * usable) / (perSide - 1);
      slots.push({ x: offset, z: dims.depth / 2 + 0.55, rotation: Math.PI });
      if (slots.length < table.seats) slots.push({ x: offset, z: -dims.depth / 2 - 0.55, rotation: 0 });
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
