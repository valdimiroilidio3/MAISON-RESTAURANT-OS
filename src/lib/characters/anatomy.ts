/**
 * Human proportions.
 *
 * The previous figures were sized with round numbers typed next to the meshes
 * ("torso 0.44 tall", "hips at 0.935"), which is why they read as assembled
 * parts rather than as people: no ratio between one limb and the next, and no
 * relationship to the chair they sit on.
 *
 * Here a figure is derived from **one** number — its stature — through the
 * canonical anthropometric ratios used in figure drawing and in ergonomics:
 * eye line at 0.935 H, shoulder at 0.82 H, elbow at 0.63 H, crotch at 0.47 H,
 * knee at 0.285 H. Build (slim / average / broad) only scales the *widths*, so
 * a heavy figure is heavier, not taller.
 *
 * Everything is in metres. No three.js, no React: this is the single source
 * that the mesh builder, the seated pose and the tests all read.
 */

import { CHAIR_SEAT_HEIGHT, TABLE_HEIGHT } from "@/lib/floor-geometry";

export type Build = "slim" | "average" | "broad";

export interface Proportions {
  /** Stature, floor to crown. */
  height: number;
  build: Build;

  head: { height: number; width: number; depth: number };
  neck: { length: number; radius: number };

  /** Joint heights above the floor, standing. */
  eye: number;
  chin: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  chest: number;
  waist: number;
  hip: number;
  crotch: number;
  knee: number;
  ankle: number;

  /** Half-widths (the figure is symmetric). */
  shoulderHalfWidth: number;
  chestHalfWidth: number;
  chestDepth: number;
  waistHalfWidth: number;
  hipHalfWidth: number;
  thighRadius: number;
  shinRadius: number;
  upperArmRadius: number;
  foreArmRadius: number;
  foot: { length: number; width: number; height: number };
}

/** Anthropometric landmarks as a fraction of stature. */
export const RATIOS = {
  eye: 0.935,
  chin: 0.87,
  shoulder: 0.82,
  chest: 0.72,
  elbow: 0.63,
  waist: 0.62,
  hip: 0.53,
  wrist: 0.485,
  crotch: 0.47,
  knee: 0.285,
  ankle: 0.039,
  /** Head height ≈ 1/7.5 of stature; width ≈ 0.66 of head height. */
  headHeight: 0.1333,
  headWidth: 0.088,
  headDepth: 0.104,
} as const;

/** Width multipliers per build. Never applied to heights. */
const BUILD: Record<Build, { shoulder: number; chest: number; waist: number; hip: number; limb: number }> = {
  slim: { shoulder: 0.93, chest: 0.92, waist: 0.88, hip: 0.93, limb: 0.92 },
  average: { shoulder: 1, chest: 1, waist: 1, hip: 1, limb: 1 },
  broad: { shoulder: 1.09, chest: 1.1, waist: 1.12, hip: 1.07, limb: 1.07 },
};

/**
 * Derive a full skeleton of measurements from a stature and a build.
 * `height` is clamped to the adult range this product depicts (1.52–1.92 m).
 */
export function proportionsFor(height: number, build: Build = "average"): Proportions {
  const h = Math.min(1.92, Math.max(1.52, height));
  const b = BUILD[build];

  return {
    height: h,
    build,
    head: {
      height: h * RATIOS.headHeight,
      width: h * RATIOS.headWidth * b.limb,
      depth: h * RATIOS.headDepth * b.limb,
    },
    neck: { length: h * 0.045, radius: h * 0.0245 * b.limb },
    eye: h * RATIOS.eye,
    chin: h * RATIOS.chin,
    shoulder: h * RATIOS.shoulder,
    elbow: h * RATIOS.elbow,
    wrist: h * RATIOS.wrist,
    chest: h * RATIOS.chest,
    waist: h * RATIOS.waist,
    hip: h * RATIOS.hip,
    crotch: h * RATIOS.crotch,
    knee: h * RATIOS.knee,
    ankle: h * RATIOS.ankle,

    // Biacromial breadth ≈ 0.23 H for men, 0.21 H for the average adult cast.
    shoulderHalfWidth: h * 0.115 * b.shoulder,
    chestHalfWidth: h * 0.093 * b.chest,
    chestDepth: h * 0.068 * b.chest,
    waistHalfWidth: h * 0.079 * b.waist,
    hipHalfWidth: h * 0.096 * b.hip,

    thighRadius: h * 0.047 * b.limb,
    shinRadius: h * 0.036 * b.limb,
    upperArmRadius: h * 0.0285 * b.limb,
    foreArmRadius: h * 0.024 * b.limb,
    foot: { length: h * 0.152, width: h * 0.055 * b.limb, height: h * 0.032 },
  };
}

/**
 * Segment lengths, kept separate so `proportionsFor` stays a plain landmark
 * table and this stays a derived view of it.
 */
export function segments(p: Proportions) {
  return {
    upperArm: (p.shoulder - p.elbow) * 0.98,
    foreArm: (p.elbow - p.wrist) * 1.02,
    hand: p.height * 0.108,
    thigh: p.hip - p.knee,
    shin: p.knee - p.ankle,
    neck: p.chin - p.shoulder,
  };
}

/**
 * Hip pivot height when the figure is seated on a chair of `seatHeight`.
 *
 * The old code used the literal 0.47 — which put guests' hips *below* the seat
 * of a 0.45 m chair and made every diner look like they were sinking into the
 * floor. The pivot is the seat plus the tissue thickness of the seated pelvis.
 */
export function seatedHipHeight(p: Proportions, seatHeight: number = CHAIR_SEAT_HEIGHT): number {
  // The pelvis compresses a cushion by about a centimetre. Scaling this with
  // height (1.8 % of stature was the first guess) lifted a 1.62 m guest off the
  // floor entirely: the hip rises but the shin does not.
  return seatHeight + 0.01;
}

/** Knee height when seated; the thigh is horizontal, so this is the seat height. */
export function seatedKneeHeight(seatHeight: number = CHAIR_SEAT_HEIGHT): number {
  return seatHeight;
}

/**
 * How far the seated figure's knees reach forward from the hip — used to keep a
 * diner under the tabletop without intersecting the apron.
 */
export function seatedKneeReach(p: Proportions): number {
  return segments(p).thigh;
}

/** Height of the ankle joint above the floor; also the height of the shoe. */
export function footHeight(p: Proportions): number {
  return p.ankle;
}

/**
 * How this person actually sits on a chair of `seatHeight`.
 *
 * Solved, not keyed. On a 0.45 m chair a 1.9 m guest's knees ride *above* the
 * seat with the shins vertical, while a 1.55 m guest's feet dangle; both are
 * correct, and both come out of the same equation:
 *
 *   kneeY = hipY + thigh·sin δ  and  ankleY = kneeY − shin  must equal the foot.
 *
 * The first version fixed the thigh horizontal and rotated the shin to reach the
 * floor, which put tall guests' feet a hand's width in front of their knees.
 * This keeps the shin vertical and lets the thigh carry the difference, which is
 * how people sit.
 */
export interface SeatedLeg {
  /** Rotation of the thigh from the body's vertical, radians (negative = forward/up). */
  thigh: number;
  /** Rotation of the shin relative to the thigh, radians. */
  knee: number;
  dangles: boolean;
}

export function seatedLeg(p: Proportions, seatHeight: number = CHAIR_SEAT_HEIGHT): SeatedLeg {
  const s = segments(p);
  const hipY = seatedHipHeight(p, seatHeight);
  const wanted = (footHeight(p) + s.shin - hipY) / s.thigh;
  const clamped = Math.max(-1, Math.min(1, wanted));
  const delta = Math.asin(clamped);
  return {
    // -π/2 is the thigh horizontal; a positive delta lifts the knee above the
    // hip, which is how a tall person sits on a low chair.
    thigh: -Math.PI / 2 - delta,
    knee: Math.PI / 2 + delta,
    // The chair is so far outside this person's leg length that even a perched
    // thigh cannot reach the floor: the feet hang.
    dangles: Math.abs(wanted) > 0.35,
  };
}

/** Clearance between the seat and the underside of the table. */
export function seatToTableClearance(seatHeight: number = CHAIR_SEAT_HEIGHT): number {
  return TABLE_HEIGHT - seatHeight;
}

/**
 * Deterministic cast: heights and builds for `count` people.
 *
 * A restaurant where everyone is 1.75 m and average build looks like a clone
 * army however good the mesh is. The distribution is deliberately real: most
 * adults between 1.60 and 1.80, a few outside it, builds spread across the range.
 */
export function castOf(count: number, seed = 20261022): Proportions[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const builds: Build[] = ["average", "average", "slim", "average", "broad", "slim", "average"];
  return Array.from({ length: count }, () => {
    // triangular-ish distribution centred on 1.72, tails at 1.56 and 1.89
    const height = 1.72 + (next() + next() + next() - 1.5) * 0.14;
    return proportionsFor(height, builds[Math.floor(next() * builds.length)]);
  });
}
