/**
 * Label placement.
 *
 * Zone captions ("ESPLANADA", "SALA") were placed at a hand-picked coordinate
 * and ended up sitting on top of a planter. A caption is a piece of furniture
 * too: it needs a clear patch of floor.
 *
 * `labelAnchor` searches the free space of a rectangle for the point that is
 * farthest from every obstacle, and returns it with the clearance it achieved.
 * Deterministic, dependency-free, and reusable by any 2D projection.
 */

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface Blocked {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Distance from a point to the nearest edge of an axis-aligned box (0 inside). */
export function distanceToBox(x: number, z: number, box: Blocked): number {
  const dx = Math.max(box.minX - x, 0, x - box.maxX);
  const dz = Math.max(box.minZ - z, 0, z - box.maxZ);
  return Math.hypot(dx, dz);
}

export interface LabelAnchor {
  x: number;
  z: number;
  /** Metres to the nearest obstacle: how much room the caption actually has. */
  clearance: number;
}

/**
 * Best position for a caption inside `area` that avoids `obstacles`.
 *
 * Candidates are sampled on a lattice plus the centre and the mid-edges, so the
 * result is stable: the same room always produces the same caption position, and
 * the position never lands on a table or a planter. `minClearance` lets a caller
 * reject a bad spot outright.
 */
export function labelAnchor(
  area: Rect,
  obstacles: Blocked[],
  options: {
    steps?: number;
    padding?: number;
    /**
     * Size of the caption itself. A label is not a point: its own width and
     * height must clear the obstacle too, so every obstacle is inflated by half
     * the caption (a Minkowski sum). Without this the anchor can be "clear"
     * while the words still run over a table.
     */
    self?: { width: number; height: number };
  } = {},
): LabelAnchor {
  const steps = options.steps ?? 9;
  const padding = options.padding ?? 0.35;
  const halfW = (options.self?.width ?? 0) / 2;
  const halfH = (options.self?.height ?? 0) / 2;
  const inflated = obstacles.map((box) => ({
    minX: box.minX - halfW,
    minZ: box.minZ - halfH,
    maxX: box.maxX + halfW,
    maxZ: box.maxZ + halfH,
  }));
  const minX = area.minX + padding;
  const maxX = area.maxX - padding;
  const minZ = area.minZ + padding;
  const maxZ = area.maxZ - padding;

  const candidates: Array<[number, number]> = [
    [(minX + maxX) / 2, (minZ + maxZ) / 2],
  ];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      candidates.push([minX + ((maxX - minX) * i) / steps, minZ + ((maxZ - minZ) * j) / steps]);
    }
  }

  let best: LabelAnchor = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, clearance: 0 };
  for (const [x, z] of candidates) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    let clearance = Infinity;
    for (const box of inflated) {
      clearance = Math.min(clearance, distanceToBox(x, z, box));
      if (clearance <= best.clearance) break;
    }
    if (clearance === Infinity) clearance = Math.max(maxX - minX, maxZ - minZ);
    if (clearance > best.clearance) best = { x, z, clearance };
  }
  return best;
}

/** Bounding box of a circle, so a round table can be passed as an obstacle. */
export function circleBox(x: number, z: number, radius: number): Blocked {
  return { minX: x - radius, minZ: z - radius, maxX: x + radius, maxZ: z + radius };
}
