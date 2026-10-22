/**
 * The garments that sit *over* the body: jacket, apron, waistcoat, apron bib.
 *
 * Kept apart from `body.ts` because these are what make a waiter read as staff
 * and a guest read as a guest, and because they are the pieces most likely to
 * be restyled without touching anatomy.
 */

import * as THREE from "three";
import type { Proportions } from "./anatomy";
import { loft, loftArc, merge, placed, slab } from "./shapes";

/**
 * An open jacket: a shell that wraps the back and both sides, with a gap at the
 * front where the shirt shows. The lapels are separate folds so the break line
 * reads at four metres, which is where most of the room sees it.
 */
export function jacketGeometry(p: Proportions, open = 0.95): THREE.BufferGeometry {
  const T = p.shoulder - p.hip;
  // The opening is at the FRONT (angle π/2 in this loft's convention), so the
  // arc runs from just past it, all the way round the back, to just before it on
  // the other side. The first version wrapped the wrong half of the body.
  const gap = 0.42 + (1 - open) * 0.5;
  const body = loftArc(
    [
      { y: -T * 0.16, w: p.hipHalfWidth * 1.1, d: p.chestDepth * 0.98, power: 2.8 },
      { y: T * 0.2, w: p.waistHalfWidth * 1.14, d: p.chestDepth * 0.94, power: 2.8 },
      { y: T * 0.6, w: p.chestHalfWidth * 1.1, d: p.chestDepth * 1.12, power: 2.6 },
      { y: T * 0.92, w: p.chestHalfWidth * 1.02, d: p.chestDepth * 1.02, power: 2.5 },
      { y: T * 1.0, w: p.chestHalfWidth * 0.7, d: p.chestDepth * 0.74, power: 2.4 },
    ],
    Math.PI / 2 + gap,
    Math.PI * 2.5 - gap,
    24,
  );

  const lapel = (side: number) =>
    placed(
      loft(
        [
          { y: 0, w: 0.012, d: 0.004, power: 3 },
          { y: p.chestDepth * 0.66, w: 0.026, d: 0.008, power: 3 },
          { y: p.chestDepth * 1.1, w: 0.018, d: 0.006, power: 3 },
        ],
        8,
      ),
      {
        position: [side * p.chestHalfWidth * 0.46, T * 0.5, p.chestDepth * 0.94],
        rotation: [0.22, side * 0.5, side * 0.16],
      },
    );

  return merge([body, lapel(1), lapel(-1)]);
}

/** A waistcoat: closed at the front, cut away under the ribs. */
export function waistcoatGeometry(p: Proportions): THREE.BufferGeometry {
  const T = p.shoulder - p.hip;
  const body = loftArc(
    [
      { y: -T * 0.1, w: p.hipHalfWidth * 1.05, d: p.chestDepth * 0.94, power: 2.8 },
      { y: T * 0.24, w: p.waistHalfWidth * 1.1, d: p.chestDepth * 0.9, power: 2.8 },
      { y: T * 0.62, w: p.chestHalfWidth * 1.06, d: p.chestDepth * 1.08, power: 2.6 },
      { y: T * 0.9, w: p.chestHalfWidth * 0.94, d: p.chestDepth * 0.94, power: 2.5 },
    ],
    Math.PI * 0.16,
    Math.PI * 0.84,
    14,
  );
  return merge([body]);
}

/**
 * The apron. A waiter's apron is the strongest single signal that someone works
 * the floor, so it is real cloth: a curved front panel that follows the body and
 * a strap that actually crosses the waist.
 */
export function apronGeometry(p: Proportions, bib = false): THREE.BufferGeometry {
  const H = p.height;
  const front = loftArc(
    [
      { y: -H * 0.2, w: p.hipHalfWidth * 1.22, d: p.chestDepth * 1.06, power: 2.8 },
      { y: -H * 0.04, w: p.hipHalfWidth * 1.14, d: p.chestDepth * 1.0, power: 2.8 },
      { y: H * 0.04, w: p.waistHalfWidth * 1.16, d: p.chestDepth * 0.92, power: 2.8 },
    ],
    Math.PI * 0.34,
    Math.PI * 0.66,
    12,
  );
  const parts = [front];
  if (bib) {
    parts.push(
      loftArc(
        [
          { y: H * 0.04, w: p.waistHalfWidth * 1.12, d: p.chestDepth * 0.92, power: 2.8 },
          { y: H * 0.22, w: p.chestHalfWidth * 0.92, d: p.chestDepth * 1.0, power: 2.6 },
          { y: H * 0.3, w: p.chestHalfWidth * 0.82, d: p.chestDepth * 0.94, power: 2.6 },
        ],
        Math.PI * 0.4,
        Math.PI * 0.6,
        10,
      ),
    );
  }
  // waist strap
  parts.push(
    placed(slab(p.hipHalfWidth * 2.24, 0.028, 0.01, 0.004), {
      position: [0, -H * 0.035, 0.0],
      rotation: [0, 0, 0],
    }),
  );
  return merge(parts);
}

/** Apron used in front of the legs: the skirt of the apron, hanging free. */
export function apronSkirtGeometry(p: Proportions): THREE.BufferGeometry {
  const H = p.height;
  return loft(
    [
      { y: -H * 0.09, w: p.hipHalfWidth * 1.18, d: p.chestDepth * 0.5, power: 3.2 },
      { y: -H * 0.2, w: p.hipHalfWidth * 1.24, d: p.chestDepth * 0.54, power: 3.2 },
    ],
    16,
  );
}
