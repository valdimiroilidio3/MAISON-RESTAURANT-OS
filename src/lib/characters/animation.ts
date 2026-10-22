/**
 * The animation layer.
 *
 * Two rules from the brief shape this file:
 *
 *  1. "Nada de ciclos repetidos óbvios em todos ao mesmo tempo." Every figure
 *     gets its own phase, its own tempo and its own intensity, derived from its
 *     seed — two waiters never step in lockstep.
 *  2. "Se um clip não existir, usa uma alternativa viável ou um estado estável."
 *     There is no GLTF clip library reachable from this environment (see
 *     `assets.ts`), so this is a hand-authored, *continuous* rig: every target
 *     angle below is a pose an animator would key, interpolated with a damped
 *     spring. Nothing here is random joint jitter.
 *
 * The rig is a joint-angle rig: hips, spine, head, shoulders, elbows, thighs,
 * knees. Angles are radians. Sign convention, one place only:
 *
 *   +x on a shoulder swings the arm forward; +x on a thigh swings the leg
 *   forward; +x on a knee bends the shin *backward* (knees don't reverse).
 *   The figure faces +Z in its own local frame; the scene rotates the group.
 */

import type { Pose } from "@/lib/simulation/types";

export interface JointSet {
  /** Vertical offset of the hips, metres. Negative = lower. */
  hipDrop: number;
  /** Hip rotation, radians. */
  hipX: number;
  hipY: number;
  /** Spine: pitch forward, twist, side-bend. */
  spineX: number;
  spineY: number;
  spineZ: number;
  headX: number;
  headY: number;
  /** Shoulders: forward swing, and out from the body (adduction). */
  shoulderLX: number;
  shoulderLZ: number;
  shoulderRX: number;
  shoulderRZ: number;
  elbowL: number;
  elbowR: number;
  /** Thighs: forward swing, and out. */
  thighLX: number;
  thighLZ: number;
  thighRX: number;
  thighRZ: number;
  kneeL: number;
  kneeR: number;
  ankleL: number;
  ankleR: number;
}

export const REST: JointSet = {
  hipDrop: 0,
  hipX: 0,
  hipY: 0,
  spineX: 0.02,
  spineY: 0,
  spineZ: 0,
  headX: 0,
  headY: 0,
  shoulderLX: 0.06,
  shoulderLZ: 0.09,
  shoulderRX: 0.06,
  shoulderRZ: -0.09,
  elbowL: 0.12,
  elbowR: 0.12,
  thighLX: 0,
  thighLZ: 0.02,
  thighRX: 0,
  thighRZ: -0.02,
  kneeL: 0.03,
  kneeR: 0.03,
  ankleL: 0,
  ankleR: 0,
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** A copy with every field of `base`, so a partial pose can be composed. */
export function joints(over: Partial<JointSet> = {}): JointSet {
  return { ...REST, ...over };
}

/**
 * Seated base pose. Thighs horizontal on the seat; the knee angle is *solved*
 * from the person's own leg length so their feet reach the floor (see
 * `seatedKneeAngle`), which is why it is a parameter here rather than π/2.
 */
export function seated(leg: { thigh: number; knee: number }, over: Partial<JointSet> = {}): JointSet {
  return joints({
    thighLX: leg.thigh,
    thighRX: leg.thigh,
    thighLZ: 0.075,
    thighRZ: -0.075,
    kneeL: leg.knee,
    kneeR: leg.knee,
    ankleL: 0,
    ankleR: 0,
    spineX: 0.04,
    ...over,
  });
}

/* ------------------------------------------------------------------ *
 * Per-figure timing
 * ------------------------------------------------------------------ */

/**
 * Each figure's private rhythm. The values are derived from the seed and are
 * stable for the life of the actor: a guest's breathing doesn't change tempo
 * when they sit down.
 */
export interface Rhythm {
  /** Phase offset, radians, so idles are not in unison. */
  phase: number;
  /** Breathing rate multiplier, 0.85–1.2. */
  breath: number;
  /** Walk cadence multiplier, 0.9–1.12. */
  cadence: number;
  /** Idle fidget intensity, 0.5–1. */
  fidget: number;
  /** Sway amplitude in radians. */
  sway: number;
}

/** splitmix32 — decorrelates adjacent seeds so no two figures share a rhythm. */
function hash01(n: number): number {
  let z = (n + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
}

export function rhythmFor(seed: number): Rhythm {
  return {
    phase: hash01(seed ^ 0x1f3a) * Math.PI * 2,
    breath: 0.85 + hash01(seed ^ 0x51ed) * 0.35,
    cadence: 0.9 + hash01(seed ^ 0x2f1b) * 0.22,
    fidget: 0.5 + hash01(seed ^ 0x7a3c) * 0.5,
    sway: 0.012 + hash01(seed ^ 0xc0fe) * 0.016,
  };
}

/* ------------------------------------------------------------------ *
 * Idle
 * ------------------------------------------------------------------ */

/**
 * Standing idle: breathing, a slow weight shift from foot to foot, a small
 * surface-level fidget in the shoulders. All continuous, all tiny — this is the
 * difference between "alive" and "mannequin", and it never looks like a tic.
 */
export function idleTargets(t: number, r: Rhythm, intensity = 1): JointSet {
  const breath = Math.sin(t * 1.35 * r.breath + r.phase);
  const shift = Math.sin(t * 0.31 * r.fidget + r.phase * 0.7);
  const micro = Math.sin(t * 0.77 * r.fidget + r.phase * 1.9);
  const w = intensity;

  return joints({
    hipDrop: breath * 0.004 * w,
    hipY: shift * 0.035 * w,
    hipX: -shift * 0.012 * w,
    spineX: 0.03 + breath * 0.012 * w,
    spineY: -shift * 0.05 * w,
    spineZ: shift * r.sway * w,
    headX: -breath * 0.01 * w + micro * 0.012 * w,
    headY: (shift * 0.12 + micro * 0.05) * w,
    shoulderLX: 0.06 + breath * 0.02 * w,
    shoulderLZ: 0.09 + breath * 0.014 * w + shift * 0.01 * w,
    shoulderRX: 0.06 + breath * 0.018 * w,
    shoulderRZ: -0.09 - breath * 0.012 * w - shift * 0.01 * w,
    elbowL: 0.14 + breath * 0.03 * w + micro * 0.02 * w,
    elbowR: 0.14 + breath * 0.028 * w - micro * 0.02 * w,
    // weight shift settles one hip and bends the other knee slightly
    thighLZ: 0.02 + shift * 0.012 * w,
    thighRZ: -0.02 + shift * 0.012 * w,
    kneeL: 0.03 + Math.max(0, -shift) * 0.05 * w,
    kneeR: 0.03 + Math.max(0, shift) * 0.05 * w,
    // the standing foot rolls a hair as the weight travels
    ankleL: shift * 0.02 * w,
    ankleR: -shift * 0.02 * w,
  });
}

/**
 * Walk cycle. `phase` advances with distance travelled, not with wall-clock
 * time, so the feet stay planted when the actor slows for a doorway.
 *
 * The gait is built from the four canonical keys — contact, down, passing, up —
 * which is why it reads as walking rather than as a pendulum. Arms swing
 * contralaterally, the pelvis rotates under the ribcage, and the head
 * counter-rotates to stay level.
 */
export function walkTargets(phase: number, r: Rhythm, speed = 1): JointSet {
  const p = phase;
  const s = Math.sin(p);
  const c = Math.cos(p);
  const amp = clamp(0.55 + speed * 0.55, 0.5, 1.15);

  // Contact/down/passing/up: the double-frequency term is the body rising over
  // the planted leg. Without it a walk floats.
  const bob = -Math.abs(Math.cos(p)) * 0.022 * amp;
  const twist = 0.09 * s * amp;
  const lean = 0.055 + 0.02 * amp;

  return joints({
    hipDrop: bob,
    hipY: -twist * 0.5,
    hipX: 0,
    spineX: lean,
    spineY: twist,
    spineZ: -c * 0.02 * amp,
    headX: -lean * 0.55,
    headY: -twist * 0.7,
    // arms oppose legs
    shoulderLX: -s * 0.42 * amp,
    shoulderLZ: 0.1,
    shoulderRX: s * 0.42 * amp,
    shoulderRZ: -0.1,
    elbowL: 0.28 + Math.max(0, s) * 0.34 * amp,
    elbowR: 0.28 + Math.max(0, -s) * 0.34 * amp,
    // legs
    thighLX: s * 0.44 * amp,
    thighLZ: 0.02,
    thighRX: -s * 0.44 * amp,
    thighRZ: -0.02,
    // knee flexes on the swing phase only, and stays nearly straight at contact
    kneeL: 0.06 + Math.max(0, -s) * 0.85 * amp,
    kneeR: 0.06 + Math.max(0, s) * 0.85 * amp,
    // ankle plantar/dorsiflexion keeps the toe off the ground in swing
    ankleL: -s * 0.18 * amp - 0.05,
    ankleR: s * 0.18 * amp - 0.05,
  });
}

/**
 * Seated idle: no walk cycle, ever. Breathing, a hand hovering near the glass or
 * the cutlery, and the occasional shift of weight on the chair. The legs are
 * derived from `seated()` so a diner's knees stay under the table.
 */
export function seatedIdleTargets(
  t: number,
  r: Rhythm,
  variant: SeatedVariant = "rest",
  leg: { thigh: number; knee: number } = { thigh: -Math.PI / 2, knee: Math.PI / 2 },
): JointSet {
  const breath = Math.sin(t * 1.15 * r.breath + r.phase);
  const shift = Math.sin(t * 0.23 * r.fidget + r.phase * 1.3);
  const micro = Math.sin(t * 0.61 * r.fidget + r.phase * 0.4);

  const hands = (): Partial<JointSet> => {
    switch (variant) {
      case "table": // both forearms resting on the table edge
        return {
          shoulderLX: 0.42,
          shoulderLZ: 0.2,
          elbowL: 0.62,
          shoulderRX: 0.42,
          shoulderRZ: -0.2,
          elbowR: 0.62,
        };
      case "glass": // right hand around a glass
        return {
          shoulderLX: 0.34,
          shoulderLZ: 0.16,
          elbowL: 0.7,
          shoulderRX: 0.5,
          shoulderRZ: -0.26,
          elbowR: 1.05 + breath * 0.02,
        };
      case "cutlery": // both hands above the plate, small working motion
        return {
          shoulderLX: 0.5,
          shoulderLZ: 0.24,
          elbowL: 0.95 + micro * 0.04,
          shoulderRX: 0.46,
          shoulderRZ: -0.2,
          elbowR: 0.9 + micro * 0.04,
        };
      case "read": // menu in both hands, lifted
        return {
          shoulderLX: 0.62,
          shoulderLZ: 0.05,
          elbowL: 1.35,
          shoulderRX: 0.62,
          shoulderRZ: -0.05,
          elbowR: 1.35,
        };
      case "talk":
        return {
          shoulderLX: 0.36 + micro * 0.05,
          shoulderLZ: 0.2 + shift * 0.02,
          elbowL: 0.95 + micro * 0.12,
          shoulderRX: 0.3,
          shoulderRZ: -0.18,
          elbowR: 0.85,
        };
      case "rest":
      default:
        return {
          shoulderLX: 0.16,
          shoulderLZ: 0.14,
          elbowL: 0.5,
          shoulderRX: 0.16,
          shoulderRZ: -0.14,
          elbowR: 0.5,
        };
    }
  };

  return seated(leg, {
    hipDrop: breath * 0.003,
    spineX: 0.05 + breath * 0.014,
    spineY: shift * 0.04,
    spineZ: shift * 0.014,
    headX: -breath * 0.012 + (variant === "talk" ? micro * 0.03 : 0),
    headY: shift * 0.1 + (variant === "talk" ? micro * 0.09 : 0),
    ...hands(),
  });
}

export type SeatedVariant = "rest" | "table" | "glass" | "cutlery" | "read" | "talk";

/* ------------------------------------------------------------------ *
 * Work poses for staff
 * ------------------------------------------------------------------ */

/**
 * Carrying a tray: one arm up and folded, the other stabilising, torso a little
 * forward, gaze forward. Used for `carry` and as the hold pose of `serve`.
 */
export function carryTargets(t: number, r: Rhythm): JointSet {
  const breath = Math.sin(t * 1.2 * r.breath + r.phase);
  return joints({
    spineX: 0.06,
    headX: -0.02,
    // left arm carries the tray at shoulder height
    shoulderLX: 1.22 + breath * 0.02,
    shoulderLZ: 0.36,
    elbowL: 1.55,
    // right arm balances, slightly out
    shoulderRX: 0.28,
    shoulderRZ: -0.24,
    elbowR: 0.55 + breath * 0.03,
    thighLX: 0.04,
    thighRX: -0.04,
  });
}

/** Serving: lean in, tray presented toward the table, free hand steadying. */
export function serveTargets(t: number, r: Rhythm): JointSet {
  const breath = Math.sin(t * 1.1 * r.breath + r.phase);
  return joints({
    spineX: 0.14 + breath * 0.02,
    spineY: -0.08,
    headX: 0.12,
    headY: -0.06,
    shoulderLX: 0.92 + breath * 0.03,
    shoulderLZ: 0.3,
    elbowL: 1.15,
    shoulderRX: 0.62,
    shoulderRZ: -0.3,
    elbowR: 1.4 + breath * 0.04,
    thighLX: 0.1,
    thighRX: -0.08,
    kneeL: 0.12,
    kneeR: 0.06,
  });
}

/** Clearing: both hands low, gathering, torso folded a little more than serve. */
export function clearTargets(t: number, r: Rhythm): JointSet {
  const breath = Math.sin(t * 1.15 * r.breath + r.phase);
  return joints({
    spineX: 0.24 + breath * 0.015,
    headX: 0.16,
    shoulderLX: 0.72,
    shoulderLZ: 0.34,
    elbowL: 1.5,
    shoulderRX: 0.64,
    shoulderRZ: -0.3,
    elbowR: 1.5 + breath * 0.02,
    thighLX: 0.14,
    thighRX: -0.1,
    kneeL: 0.18,
    kneeR: 0.1,
  });
}

/** Reading an order at the pass / host stand: weight on one leg, head down. */
export function readTargets(t: number, r: Rhythm): JointSet {
  const base = idleTargets(t, r, 0.5);
  return {
    ...base,
    spineX: 0.1,
    headX: 0.24,
    headY: 0.04,
    shoulderLX: 0.55,
    shoulderLZ: 0.14,
    elbowL: 0.95,
    shoulderRX: 0.5,
    shoulderRZ: -0.12,
    elbowR: 0.9,
  };
}

/** Cooking: working over a pass, both hands busy, small constant motion. */
export function cookTargets(t: number, r: Rhythm): JointSet {
  const work = Math.sin(t * 2.1 * r.fidget + r.phase);
  const work2 = Math.sin(t * 1.7 * r.fidget + r.phase * 1.7);
  return joints({
    spineX: 0.16,
    headX: 0.22,
    shoulderLX: 0.72 + work * 0.05,
    shoulderLZ: 0.26,
    elbowL: 1.28 + work * 0.08,
    shoulderRX: 0.68 + work2 * 0.05,
    shoulderRZ: -0.24,
    elbowR: 1.24 + work2 * 0.08,
    thighLX: 0.06,
    thighRX: -0.05,
    kneeL: 0.1,
    kneeR: 0.08,
  });
}

/** Paying: reaching to a card terminal on the table. */
export function payTargets(
  t: number,
  r: Rhythm,
  leg: { thigh: number; knee: number } = { thigh: -Math.PI / 2, knee: Math.PI / 2 },
): JointSet {
  const breath = Math.sin(t * 1.1 * r.breath + r.phase);
  return {
    ...seatedIdleTargets(t, r, "rest", leg),
    spineX: 0.1,
    headX: 0.18,
    shoulderRX: 0.66,
    shoulderRZ: -0.22,
    elbowR: 0.92 + breath * 0.02,
  };
}

/* ------------------------------------------------------------------ *
 * Blending
 * ------------------------------------------------------------------ */

/**
 * Frame-rate independent damping. `lambda` is how fast we approach the target:
 * ~6 for a posture change, ~14 for a task, ~30 for a snap. This is what makes a
 * state change glide instead of pop — and, crucially, what stops a state change
 * from *restarting* the walk: the phase clock keeps running, only targets move.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function dampJoints(current: JointSet, target: JointSet, lambda: number, dt: number): JointSet {
  const out = {} as JointSet;
  for (const k of Object.keys(current) as (keyof JointSet)[]) {
    out[k] = damp(current[k], target[k], lambda, dt);
  }
  return out;
}

/**
 * How quickly a given pose should be adopted. Standing and seated postures are
 * slow (a person doesn't teleport into a chair); work poses are quicker; the
 * walk cycle is fastest because it is continuously re-targeted anyway.
 */
export function blendRateFor(pose: Pose): number {
  switch (pose) {
    case "sit":
    case "stand":
      return 7;
    case "walk":
      return 13;
    case "eat":
    case "drink":
    case "read":
    case "pay":
    case "talk":
      return 8;
    case "carry":
    case "serve":
    case "clear":
    case "cook":
      return 10;
    default:
      return 9;
  }
}


/* ------------------------------------------------------------------ *
 * Forward kinematics — the ground-truth check
 * ------------------------------------------------------------------ */

export interface LegChain {
  thigh: number;
  shin: number;
}

/**
 * Ankle position relative to the hip pivot, in the sagittal plane.
 * `y` is metres below the hip (negative), `z` metres forward (positive).
 *
 * This is the function that lets a test prove the feet are on the floor instead
 * of a screenshot that nobody took.
 */
export function ankleFromHip(j: JointSet, leg: LegChain, side: "L" | "R"): { y: number; z: number } {
  const thigh = side === "L" ? j.thighLX : j.thighRX;
  const knee = side === "L" ? j.kneeL : j.kneeR;
  const kneeY = -leg.thigh * Math.cos(thigh);
  const kneeZ = -leg.thigh * Math.sin(thigh);
  const shinAngle = thigh + knee;
  return {
    y: kneeY - leg.shin * Math.cos(shinAngle),
    z: kneeZ - leg.shin * Math.sin(shinAngle),
  };
}

/**
 * The hip height that puts the lower foot exactly on the floor.
 *
 * Walking and standing are solved rather than keyed: whatever the legs are
 * doing this frame, the body is placed so that neither shoe sinks into the
 * floor and neither floats. This is why the walk has a bob without an animator
 * authoring one.
 */
export interface ShoeShape {
  /** Horizontal distance from the ankle joint to the toe tip and to the heel. */
  toe: number;
  heel: number;
  /** Vertical drop from the ankle joint to the sole. Measured from the mesh. */
  height: number;
}

/**
 * Hip height that leaves the lowest part of the shoes exactly on the floor.
 *
 * Solving for the ankle alone is not enough: the sole is a plate hanging below
 * the ankle, so as soon as the foot plantar-flexes at contact one corner dips
 * through the floor — measured at 14 mm on the first walk cycle. The corners are
 * therefore projected too, which is what stops the "skating on ice" look.
 */
export function groundedHipHeight(
  j: JointSet,
  leg: LegChain,
  ankleHeight: number,
  shoe?: ShoeShape,
): number {
  let lowest = Infinity;
  for (const side of ["L", "R"] as const) {
    const ankle = ankleFromHip(j, leg, side).y;
    if (!shoe) {
      lowest = Math.min(lowest, ankle - ankleHeight);
      continue;
    }
    const tilt =
      side === "L" ? j.thighLX + j.kneeL + j.ankleL : j.thighRX + j.kneeR + j.ankleR;
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    const drop = shoe.height;
    lowest = Math.min(
      lowest,
      ankle - drop * c - shoe.toe * s,
      ankle - drop * c + shoe.heel * s,
    );
  }
  return -lowest + 0.001;
}
