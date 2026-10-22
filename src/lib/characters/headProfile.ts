/**
 * The skull, as one table.
 *
 * The head mesh, the hair, the eyes, the brows and the lips all read this file.
 * That is deliberate: the first version positioned the eyes against a *guess* of
 * where the face was, and every guest ended up with eyes inside their skull and
 * hair sunk into their crown. One table, one surface function, no drift.
 *
 * Units are head heights (y = 0 at the chin, y = 1 at the crown); `w` and `d`
 * are half-extents in the same units. `power` is the superellipse exponent of
 * the cross-section (2 = ellipse, higher = flatter planes).
 */

import type { Section } from "./shapes";

export const HEAD_UNIT = {
  halfWidth: 0.348,
  halfDepth: 0.392,
};

export const HEAD_PROFILE: Section[] = [
  { y: 0.0, w: 0.115, d: 0.13, z: 0.036, power: 2.3 },
  { y: 0.045, w: 0.185, d: 0.225, z: 0.022, power: 2.3 },
  { y: 0.1, w: 0.238, d: 0.288, z: 0.012, power: 2.3 },
  { y: 0.175, w: 0.292, d: 0.338, z: 0.006, power: 2.4 },
  { y: 0.27, w: 0.322, d: 0.368, z: 0, power: 2.5 },
  { y: 0.36, w: 0.339, d: 0.386, z: 0, power: 2.5 },
  { y: 0.46, w: 0.346, d: 0.392, z: 0, power: 2.4 },
  { y: 0.56, w: 0.35, d: 0.391, z: -0.002, power: 2.3 },
  { y: 0.66, w: 0.348, d: 0.384, z: -0.006, power: 2.2 },
  { y: 0.78, w: 0.335, d: 0.362, z: -0.01, power: 2.2 },
  { y: 0.88, w: 0.3, d: 0.318, z: -0.012, power: 2.2 },
  { y: 0.95, w: 0.225, d: 0.238, z: -0.014, power: 2.2 },
  { y: 0.985, w: 0.145, d: 0.155, z: -0.014, power: 2.2 },
  { y: 1.0, w: 0.06, d: 0.065, z: -0.014, power: 2.2 },
];

/** The profile row active at a given head-unit height, linearly interpolated. */
export function skullAt(unitY: number): { w: number; d: number; z: number; power: number } {
  const table = HEAD_PROFILE;
  const y = Math.max(0, Math.min(1, unitY));
  for (let i = 1; i < table.length; i++) {
    if (y <= table[i].y || i === table.length - 1) {
      const a = table[i - 1];
      const b = table[i];
      const t = b.y === a.y ? 0 : Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y)));
      return {
        w: a.w + (b.w - a.w) * t,
        d: a.d + (b.d - a.d) * t,
        z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t,
        power: (a.power ?? 2) + ((b.power ?? 2) - (a.power ?? 2)) * t,
      };
    }
  }
  return { w: HEAD_UNIT.halfWidth, d: HEAD_UNIT.halfDepth, z: 0, power: 2.2 };
}

/**
 * The skull's front surface, in metres, at a point on the face.
 *
 * `xRatio` is the horizontal position as a fraction of the half-width at that
 * height (-1 … 1). A feature placed with this cannot end up inside the head, and
 * cannot float off it either — which is exactly what the eyes and the mouth did.
 */
export function facePoint(
  unitY: number,
  xRatio: number,
  dims: { halfWidth: number; halfDepth: number },
): { x: number; y: number; z: number } {
  const s = skullAt(unitY);
  const power = s.power;
  const xr = Math.max(-1, Math.min(1, xRatio));
  // superellipse: (|x|/w)^p + (|z|/d)^p = 1
  const zr = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(xr), power)), 1 / power);
  const w = (s.w / HEAD_UNIT.halfWidth) * dims.halfWidth;
  const d = (s.d / HEAD_UNIT.halfDepth) * dims.halfDepth;
  return {
    x: xr * w,
    y: unitY,
    z: zr * d + s.z * 0,
  };
}
