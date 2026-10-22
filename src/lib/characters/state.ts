/**
 * The adapter between the simulation and the body.
 *
 * The engine owns *what* an actor is doing (its pose, its position, its table);
 * this module decides *how the body should be held* to express it. It is pure,
 * so the mapping can be tested without a renderer, and it never writes back:
 * animation must not change a reservation, an order or a table state.
 */

import type { Pose, SimActor } from "@/lib/simulation/types";
import type { SeatedVariant } from "./animation";

/** Poses in which the figure is on a chair. */
const SEATED: ReadonlySet<Pose> = new Set<Pose>(["sit", "eat", "drink", "read", "talk", "pay"]);

export function isSeatedPose(pose: Pose): boolean {
  return SEATED.has(pose);
}

export interface AnimationIntent {
  /** On a chair, not merely near one. */
  seated: boolean;
  /** Translating this frame — drives the walk cycle rather than an idle. */
  moving: boolean;
  pose: Pose;
  /** Which seated posture to hold. */
  variant: SeatedVariant;
  /** Rate at which the body adopts the new posture. */
  blend: number;
}

/**
 * Which seated posture a pose asks for.
 *
 * `sit` itself is a *transition*: the chair has been reached, the actor is
 * settling. It is deliberately the plain variant so the body does not start
 * eating the moment it touches the seat.
 */
function seatedVariantFor(pose: Pose, carrying: SimActor["carrying"]): SeatedVariant {
  switch (pose) {
    case "eat":
      return "cutlery";
    case "drink":
      return "glass";
    case "read":
      return "read";
    case "talk":
      return "talk";
    case "pay":
      return "glass";
    default:
      void carrying;
      return "rest";
  }
}

export function animationIntentFor(actor: SimActor): AnimationIntent {
  const seated = isSeatedPose(actor.pose);
  const moving = actor.pose === "walk";

  // A figure that is walking is never seated, whatever the previous pose said.
  return {
    seated: seated && !moving,
    moving,
    pose: actor.pose,
    variant: seated ? seatedVariantFor(actor.pose, actor.carrying) : "rest",
    blend: moving ? 13 : seated ? 7 : 9,
  };
}

/**
 * Advance the walk phase from distance travelled, not from wall-clock time.
 *
 * This is what keeps feet planted: the stride is tied to metres covered, so an
 * actor who slows at a doorway takes shorter steps instead of moonwalking, and
 * an actor who stops keeps the phase where it was rather than snapping to zero.
 */
export function advancePhase(phase: number, distance: number, strideLength: number): number {
  if (distance <= 0 || strideLength <= 0) return phase;
  // Two steps per full cycle, one cycle per 2 × stride.
  return (phase + (distance / (strideLength * 2)) * Math.PI * 2) % (Math.PI * 2);
}

/**
 * Stride length for a body. Taller people take longer steps; the ratio is the
 * classic walk-to-height relation (~0.41 H per step).
 */
export function strideLengthFor(height: number): number {
  return height * 0.41;
}

/**
 * The interaction points a character needs, in world space. Exposed so the
 * scene and the tests agree on where a person actually goes:
 *
 *  - `seat` is the chair this guest was *assigned*, never the table centre;
 *  - `stand` is the point beside the chair where they rise to;
 *  - `service` is where staff stand to reach the table — outside the chair ring.
 */
export interface InteractionPoints {
  seat: { x: number; z: number; rotation: number };
  stand: { x: number; z: number };
}

/** Height at which a seated diner's hands meet the tabletop (metres). */
export function seatedHandHeight(seatHeight: number, tableHeight: number): number {
  return Math.min(tableHeight, seatHeight + 0.2);
}
