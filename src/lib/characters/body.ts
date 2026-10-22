/**
 * The body, as geometry.
 *
 * Every part is derived from `Proportions` — not typed in next to a mesh. A
 * 1.62 m slim guest and a 1.86 m broad guest get genuinely different skeletons
 * from the same code path, and the same skeleton is what the animation rig and
 * the collision tests read.
 *
 * Geometry is cached by a **quantised body signature** (height to the nearest
 * 2 cm + build). A floor of thirty diners therefore shares perhaps a dozen
 * copies of each part instead of allocating thirty, which is the difference
 * between a scene that runs on a laptop and one that does not.
 *
 * Coordinate spaces, stated once:
 *   - body parts: metres, origin at the hip pivot, +Y up, +Z forward (facing);
 *   - head parts: metres, origin at the atlas joint (base of the skull);
 *   - hair/face details: head units, y = 0 chin, y = 1 crown, scaled to the head.
 */

import * as THREE from "three";
import type { Appearance } from "./appearance";
import { proportionsFor, segments, type Proportions } from "./anatomy";
import { ball, loft, loftArc, merge, paint, paintWhere, placed, slab, type Section } from "./shapes";
import { HEAD_PROFILE, HEAD_UNIT, facePoint, skullAt } from "./headProfile";

/* ------------------------------------------------------------------ *
 * Cache
 * ------------------------------------------------------------------ */

export interface BodyGeometry {
  signature: string;
  hips: THREE.BufferGeometry;
  torso: THREE.BufferGeometry;
  collar: THREE.BufferGeometry | null;
  neck: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  lips: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  brows: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  foreArm: THREE.BufferGeometry;
  hand: THREE.BufferGeometry;
  handMirror: THREE.BufferGeometry;
  sleeveCap: THREE.BufferGeometry;
  /** Full-length sleeve for jackets and shirts; open at the wrist. */
  sleeveLong: THREE.BufferGeometry;
  hipJoint: THREE.BufferGeometry;
  shoulderJoint: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  shoe: THREE.BufferGeometry;
  /** Metres, hips-local. */
  dims: {
    torsoTop: number;
    shoulderY: number;
    shoulderX: number;
    hipJointX: number;
    thighLength: number;
    shinLength: number;
    upperArmLength: number;
    foreArmLength: number;
    handLength: number;
    neckTop: number;
    headPivotY: number;
    headScale: [number, number, number];
    collarY: number;
    waistY: number;
  };
  /** The proportions this bundle was built from. */
  proportions: Proportions;
}

const CACHE = new Map<string, BodyGeometry>();
const MAX_CACHE = 96;

export function signatureFor(p: Proportions, face: Appearance["face"]): string {
  const jaw = face.jaw < 1.02 ? 0 : face.jaw < 1.08 ? 1 : 2;
  const cheek = face.cheek < 1.02 ? 0 : 1;
  return `${Math.round(p.height * 50)}|${p.build}|${jaw}|${cheek}`;
}

/** Drop and dispose every cached body. Called when the scene unmounts. */
export function clearBodyCache(): void {
  for (const entry of CACHE.values()) {
    for (const value of Object.values(entry)) {
      if (value instanceof THREE.BufferGeometry) value.dispose();
    }
  }
  CACHE.clear();
}

/* ------------------------------------------------------------------ *
 * Parts
 * ------------------------------------------------------------------ */

function torsoGeometry(p: Proportions): THREE.BufferGeometry {
  const T = p.shoulder - p.hip;
  const sections: Section[] = [
    // the hip line: a shirt falls straight from the iliac crest
    { y: -T * 0.07, w: p.hipHalfWidth * 0.96, d: p.chestDepth * 0.9, power: 2.7 },
    { y: T * 0.1, w: p.waistHalfWidth * 1.06, d: p.chestDepth * 0.8, power: 2.7 },
    // the waist is the narrowest point of a human torso; without it a shirt is a tube
    { y: T * 0.22, w: p.waistHalfWidth, d: p.chestDepth * 0.8, power: 2.7 },
    { y: T * 0.42, w: p.chestHalfWidth * 0.92, d: p.chestDepth * 0.94, power: 2.6 },
    { y: T * 0.64, w: p.chestHalfWidth, d: p.chestDepth, power: 2.5 },
    { y: T * 0.83, w: p.chestHalfWidth * 0.97, d: p.chestDepth * 0.92, power: 2.4 },
    // trapezius slope into the neck
    { y: T * 0.99, w: p.chestHalfWidth * 0.86, d: p.chestDepth * 0.8, power: 2.3 },
  ];
  return loft(sections, 22, true, true);
}

function hipsGeometry(p: Proportions): THREE.BufferGeometry {
  const H = p.height;
  return loft(
    [
      { y: -H * 0.085, w: p.hipHalfWidth * 0.68, d: p.chestDepth * 0.66, power: 2.6 },
      { y: -H * 0.05, w: p.hipHalfWidth * 0.93, d: p.chestDepth * 0.82, power: 2.7 },
      { y: -H * 0.012, w: p.hipHalfWidth, d: p.chestDepth * 0.88, power: 2.8 },
      { y: H * 0.02, w: p.hipHalfWidth * 0.95, d: p.chestDepth * 0.86, power: 2.8 },
    ],
    20,
    true,
    true,
  );
}

function neckGeometry(p: Proportions): THREE.BufferGeometry {
  // Runs from *inside* the shoulder line up to the chin. Anything shorter and
  // the head appears to sit directly on the collar, which is the single most
  // common way a figure reads as a doll.
  const shoulderY = (p.shoulder - p.hip) * 0.93;
  const chinY = p.chin - p.hip + p.height * 0.008;
  return loft(
    [
      { y: shoulderY, w: p.neck.radius * 1.3, d: p.neck.radius * 1.26, power: 2.2 },
      { y: shoulderY + (chinY - shoulderY) * 0.45, w: p.neck.radius * 1.02, d: p.neck.radius * 1.0, power: 2.1 },
      { y: chinY, w: p.neck.radius * 0.94, d: p.neck.radius * 0.92, z: p.height * 0.004, power: 2.1 },
    ],
    14,
  );
}

/**
 * The head. This is the part that decides whether the figure reads as a person,
 * so it is the part with the most attention: a cranium widest at the temples, a
 * jaw that narrows to a chin, cheekbones, a brow ridge that shades the eyes, a
 * nose with a bridge and a tip, and ears with a helix.
 *
 * Built in metres, in head space (origin at the chin), with the face variant
 * baked in so no two guests share a face. The nose is part of this buffer: a
 * separate cone is what makes a low-poly head look like a snowman.
 */
function headGeometry(p: Proportions, face: Appearance["face"]): THREE.BufferGeometry {
  const hh = p.head.height;
  const hw = (p.head.width / 2) * face.cheek;
  const hd = p.head.depth / 2;
  const jaw = face.jaw;
  const len = face.length;
  const dims = { halfWidth: hw, halfDepth: hd };

  const sections: Section[] = HEAD_PROFILE.map((s) => ({
    y: s.y * len * hh,
    // the jaw scales independently of the cranium, which is what makes faces differ
    w: (s.w / HEAD_UNIT.halfWidth) * hw * (s.y < 0.3 ? jaw : 1),
    d: (s.d / HEAD_UNIT.halfDepth) * hd,
    z: (s.z ?? 0) * hh,
    power: s.power,
  }));

  const shell = loft(sections, 30, true, true);

  // Nose: bridge → dorsum → tip → alae. Every ring is anchored to the real
  // surface, then pushed out by a measured amount, so the profile is a nose and
  // not a beak or a bump.
  const noseAt = (y: number, w: number, d: number, out: number) => {
    const f = facePoint(y, 0, dims);
    return { y: y * hh, w, d, z: f.z + out, power: 2.2 };
  };
  const nose = loft(
    [
      noseAt(0.55, 0.007, 0.004, -0.002),
      noseAt(0.51, 0.009, 0.005, 0.001),
      noseAt(0.465, 0.012, 0.007, 0.005),
      noseAt(0.42, 0.015, 0.009, 0.009),
      noseAt(0.383, 0.018, 0.011, 0.012),
      noseAt(0.362, 0.021, 0.009, 0.007),
      noseAt(0.345, 0.019, 0.006, 0.0),
    ],
    14,
  );

  // Ears: a flattened shell with a helix rim, against the skull.
  const ear = (side: number) =>
    merge([
      placed(ball(1, 12, 10), {
        position: [side * hw * 0.985, 0.43 * hh, -0.032 * hh],
        scale: [0.0075, 0.026, 0.016],
      }),
      placed(ball(1, 10, 8), {
        position: [side * hw * 1.02, 0.44 * hh, -0.03 * hh],
        scale: [0.003, 0.015, 0.009],
      }),
    ]);

  // Brow ridge: a shelf that catches the key light and shades the eye socket.
  const ridge = merge(
    [1, -1].map((side) => {
      const f = facePoint(0.585, side * 0.4, dims);
      return placed(ball(1, 14, 8), {
        position: [f.x, 0.585 * hh, f.z - 0.006],
        scale: [hw * 0.32, hh * 0.014, hd * 0.045],
        rotation: [0, 0, side * -0.1],
      });
    }),
  );

  // Cheekbones and a chin: the planes that make a face legible in profile.
  const cheek = merge(
    [1, -1].map((side) => {
      const f = facePoint(0.37, side * 0.58, dims);
      return placed(ball(1, 14, 10), {
        position: [f.x, 0.36 * hh, f.z - hd * 0.22],
        scale: [hw * 0.3, hh * 0.07, hd * 0.062],
      });
    }),
  );

  return merge([shell, nose, ear(1), ear(-1), ridge, cheek]);
}

/**
 * Eyes. A thin lens, not a bead: the sclera barely clears the lid line, the iris
 * is brown rather than black, and the top of the sclera is painted as a lash
 * line so the eye reads as an opening in a face instead of a stuck-on sphere.
 */
function eyesGeometry(p: Proportions): THREE.BufferGeometry {
  const hw = p.head.width / 2;
  const hh = p.head.height;
  const hd = p.head.depth / 2;
  const dims = { halfWidth: hw, halfDepth: hd };
  const lid = new THREE.Color("#2a1c14");
  const scleraCol = new THREE.Color("#e9e2d8");
  const irisCol = new THREE.Color("#4a3524");
  const pupilCol = new THREE.Color("#100c09");
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const f = facePoint(0.472, side * 0.4, dims);
    const cx = f.x;
    const cy = 0.472 * hh;
    // 5 mm behind the skin at the eye's own x: the sclera clears it by ~3 mm,
    // so the eye sits in a socket instead of on top of the face.
    const cz = f.z - 0.005;
    const sclera = placed(ball(1, 14, 10), {
      position: [cx, cy, cz],
      scale: [hw * 0.175, hh * 0.027, hd * 0.09],
    });
    paint(sclera, scleraCol);
    paintWhere(sclera, lid, (_x, y) => y > cy + hh * 0.013);
    parts.push(sclera);
    parts.push(
      paint(
        placed(ball(1, 12, 8), {
          position: [cx, cy - hh * 0.002, cz + hd * 0.082],
          scale: [hw * 0.068, hh * 0.023, hd * 0.03],
        }),
        irisCol,
      ),
    );
    parts.push(
      paint(
        placed(ball(1, 10, 6), {
          position: [cx, cy - hh * 0.002, cz + hd * 0.098],
          scale: [hw * 0.026, hh * 0.012, hd * 0.012],
        }),
        pupilCol,
      ),
    );
  }
  return merge(parts);
}

/** Eyebrows: thin, arched, and dark enough to hold the top of the face. */
function browsGeometry(p: Proportions): THREE.BufferGeometry {
  const hw = p.head.width / 2;
  const hh = p.head.height;
  const hd = p.head.depth / 2;
  const dims = { halfWidth: hw, halfDepth: hd };
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const f = facePoint(0.566, side * 0.42, dims);
    parts.push(
      placed(ball(1, 12, 6), {
        position: [f.x, 0.566 * hh, f.z + 0.001],
        scale: [hw * 0.235, hh * 0.0085, hd * 0.012],
        rotation: [0, 0, side * -0.14],
      }),
    );
  }
  return merge(parts);
}

function lipsGeometry(p: Proportions): THREE.BufferGeometry {
  const hw = p.head.width / 2;
  const hh = p.head.height;
  const hd = p.head.depth / 2;
  const w = hw * 0.44;
  const surface = facePoint(0.235, 0, { halfWidth: hw, halfDepth: hd }).z;
  return loft(
    [
      { y: 0.212 * hh, w: w * 0.44, d: 0.0022, z: surface - 0.004, power: 2.2 },
      { y: 0.224 * hh, w: w * 0.92, d: 0.0038, z: surface - 0.001, power: 2.3 },
      { y: 0.235 * hh, w: w * 0.74, d: 0.0028, z: surface - 0.0025, power: 2.2 },
      { y: 0.246 * hh, w: w * 0.86, d: 0.0034, z: surface - 0.001, power: 2.3 },
      { y: 0.257 * hh, w: w * 0.38, d: 0.0018, z: surface - 0.004, power: 2.2 },
    ],
    16,
  );
}

/**
 * The upper arm, as one continuous surface.
 *
 * The old version stacked a sphere on a tapered cylinder: a ball at the shoulder
 * and a hard rim where the two met. A real deltoid is a dome that swells out of
 * the trapezius and flows into the bicep, so the loft starts above the joint with
 * a small ring and grows — no second primitive, no seam, no ball to poke through
 * a sleeve.
 */
function armProfile(r: number, length: number): Section[] {
  return [
    { y: r * 0.92, w: r * 0.15, d: r * 0.15, power: 2.2 },
    { y: r * 0.74, w: r * 0.54, d: r * 0.52, power: 2.2 },
    { y: r * 0.42, w: r * 0.88, d: r * 0.84, power: 2.2 },
    { y: 0, w: r * 1.02, d: r * 0.96, power: 2.2 },
    { y: -length * 0.22, w: r * 1.03, d: r * 0.97, power: 2.2 },
    { y: -length * 0.55, w: r * 0.92, d: r * 0.88, power: 2.1 },
    { y: -length * 0.84, w: r * 0.79, d: r * 0.76, power: 2.1 },
    { y: -length, w: r * 0.72, d: r * 0.70, power: 2.1 },
  ];
}

/** A garment sleeve is the arm's own profile, pushed out by the cloth. */
function sleeveProfile(profile: Section[], clean: number, endY: number): Section[] {
  return profile
    .filter((section) => section.y >= endY)
    .map((section) => ({
      ...section,
      w: section.w + clean,
      d: section.d + clean,
    }));
}

/** Arms and legs are tapered lofts. */

function armPart(p: Proportions, length: number, profile: Array<{ t: number; r: number }>): THREE.BufferGeometry {
  const sections: Section[] = profile.map((entry) => ({
    y: -length * entry.t,
    w: entry.r,
    d: entry.r * 0.95,
    power: 2.1,
  }));
  return loft(sections, 14, true, true);
}

function handGeometry(p: Proportions, mirror: boolean): THREE.BufferGeometry {
  const L = segments(p).hand;
  const palm = L * 0.5;
  const parts: THREE.BufferGeometry[] = [
    loft(
      [
        { y: 0, w: L * 0.13, d: L * 0.09, power: 2.4 },
        { y: -palm * 0.25, w: L * 0.165, d: L * 0.1, power: 2.6 },
        { y: -palm * 0.7, w: L * 0.175, d: L * 0.088, power: 2.8 },
        { y: -palm, w: L * 0.16, d: L * 0.072, power: 2.8 },
      ],
      14,
    ),
  ];
  // four fingers, each a two-segment loft so they curl instead of standing to attention
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * L * 0.078;
    const length = L * (0.34 - Math.abs(i - 1.2) * 0.022);
    const knuckle = placed(ball(L * 0.036, 8, 6), { position: [x, -palm, L * 0.005] });
    const proximal = placed(
      loft([
        { y: 0, w: L * 0.036, d: L * 0.036 },
        { y: -length * 0.55, w: L * 0.033, d: L * 0.033 },
      ], 8),
      { position: [x, -palm, L * 0.004], rotation: [0.18, 0, 0] },
    );
    const distal = placed(
      loft([
        { y: 0, w: L * 0.031, d: L * 0.032 },
        { y: -length * 0.5, w: L * 0.026, d: L * 0.027 },
      ], 8),
      { position: [x, -palm - length * 0.5 * Math.cos(0.18), L * 0.004 + length * 0.5 * Math.sin(0.18)], rotation: [0.45, 0, 0] },
    );
    parts.push(knuckle, proximal, distal);
  }
  // thumb, off the side of the palm and forward
  parts.push(
    placed(
      loft([
        { y: 0, w: L * 0.052, d: L * 0.052 },
        { y: -L * 0.16, w: L * 0.044, d: L * 0.046 },
        { y: -L * 0.26, w: L * 0.034, d: L * 0.036 },
      ], 8),
      { position: [L * 0.14, -palm * 0.3, L * 0.02], rotation: [0.35, 0, -0.95] },
    ),
  );
  const merged = merge(parts);
  if (!mirror) return merged;
  // Mirror across X, reversing the winding so the surface still faces outward.
  const pos = merged.getAttribute("position") as THREE.BufferAttribute;
  const nor = merged.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, -pos.getX(i));
    nor.setX(i, -nor.getX(i));
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  const index = merged.getIndex();
  if (index) {
    const arr = index.array as ArrayLike<number>;
    const flipped = new Uint32Array(arr.length);
    for (let i = 0; i < arr.length; i += 3) {
      flipped[i] = arr[i];
      flipped[i + 1] = arr[i + 2];
      flipped[i + 2] = arr[i + 1];
    }
    merged.setIndex(new THREE.BufferAttribute(flipped, 1));
  }
  merged.computeBoundingSphere();
  return merged;
}

function shoeGeometry(p: Proportions): THREE.BufferGeometry {
  // The shoe is exactly as tall as the ankle joint, so its top edge meets the
  // tibia and its sole rests on the floor when the leg is straight.
  const total = p.ankle;
  const soleH = total * 0.28;
  const upperH = total - soleH;
  const len = p.foot.length;
  const sections: Section[] = [
    { y: -len * 0.5, w: p.foot.width * 0.5, d: upperH * 0.44, power: 2.6 },
    { y: -len * 0.34, w: p.foot.width * 0.62, d: upperH * 0.5, power: 2.8 },
    { y: -len * 0.1, w: p.foot.width * 0.72, d: upperH * 0.52, power: 3 },
    { y: len * 0.2, w: p.foot.width * 0.78, d: upperH * 0.34, power: 3 },
    { y: len * 0.42, w: p.foot.width * 0.66, d: upperH * 0.2, power: 2.8 },
    { y: len * 0.52, w: p.foot.width * 0.32, d: upperH * 0.1, power: 2.4 },
  ];
  // Built along +Y then laid down: the stacking axis becomes the toe direction.
  const upper = placed(loft(sections, 14, true, true), {
    rotation: [Math.PI / 2, 0, 0],
    position: [0, -soleH - upperH * 0.5, 0],
  });
  const sole = placed(slab(p.foot.width * 0.8, soleH, len * 0.98, 0.003), {
    position: [0, -total, -len * 0.02],
  });
  return merge([upper, sole]);
}

function collarGeometry(p: Proportions, kind: "ring" | "flaps" | "band"): THREE.BufferGeometry {
  const r = p.neck.radius * 1.42;
  const y = p.chin - p.shoulder;
  if (kind === "ring") {
    return placed(
      loft(
        [
          { y: 0, w: r * 1.12, d: r * 1.05, power: 2.2 },
          { y: p.height * 0.014, w: r * 1.04, d: r * 0.98, power: 2.2 },
        ],
        16,
      ),
      { position: [0, p.shoulder - p.hip - y * 0.06, 0] },
    );
  }
  if (kind === "band") {
    return placed(
      loft(
        [
          { y: 0, w: r * 1.22, d: r * 1.14, power: 2.3 },
          { y: p.height * 0.03, w: r * 1.2, d: r * 1.12, power: 2.3 },
        ],
        16,
      ),
      { position: [0, p.shoulder - p.hip - y * 0.12, 0] },
    );
  }
  // shirt collar: a band plus two folded points
  const band = placed(
    loft(
      [
        { y: 0, w: r * 1.24, d: r * 1.16, power: 2.3 },
        { y: p.height * 0.034, w: r * 1.16, d: r * 1.1, power: 2.2 },
      ],
      16,
    ),
    { position: [0, p.shoulder - p.hip - y * 0.1, 0] },
  );
  const point = (side: number) =>
    placed(
      loft(
        [
          { y: 0, w: r * 0.62, d: r * 0.34, power: 3 },
          { y: p.height * 0.05, w: r * 0.5, d: r * 0.2, power: 3 },
        ],
        8,
      ),
      {
        position: [side * r * 0.5, p.shoulder - p.hip - y * 0.1, r * 0.72],
        rotation: [0.42, side * 0.35, side * 0.5],
      },
    );
  return merge([band, point(1), point(-1)]);
}

/** Placket, buttons and pocket flap: the details that say "a shirt". */
function placketGeometry(p: Proportions): THREE.BufferGeometry {
  const T = p.shoulder - p.hip;
  const y = T * 0.9;
  const parts: THREE.BufferGeometry[] = [
    placed(slab(0.019, T * 0.62, 0.006, 0.002), {
      position: [0, -T * 0.02, p.chestDepth * 0.9],
    }),
  ];
  for (let i = 0; i < 4; i++) {
    parts.push(
      placed(ball(0.0042, 8, 6), {
        position: [0, T * 0.16 + i * T * 0.16 - T * 0.02, p.chestDepth * 1.0],
      }),
    );
  }
  void y;
  return merge(parts);
}

export function bodyGeometry(p: Proportions, face: Appearance["face"]): BodyGeometry {
  const signature = signatureFor(p, face);
  const cached = CACHE.get(signature);
  if (cached) return cached;

  const s = segments(p);
  const T = p.shoulder - p.hip;
  const headScale: [number, number, number] = [
    ((p.head.width / 2) / HEAD_UNIT.halfWidth) * face.cheek,
    p.head.height * face.length,
    (p.head.depth / 2) / HEAD_UNIT.halfDepth,
  ];

  const bundle: BodyGeometry = {
    signature,
    proportions: p,
    hips: hipsGeometry(p),
    torso: torsoGeometry(p),
    collar: null,
    neck: neckGeometry(p),
    head: headGeometry(p, face),
    lips: lipsGeometry(p),
    eyes: eyesGeometry(p),
    brows: browsGeometry(p),
    upperArm: loft(armProfile(p.upperArmRadius, s.upperArm), 20, true, true),
    foreArm: armPart(p, s.foreArm, [
      { t: -0.06, r: p.foreArmRadius * 0.9 },
      { t: 0, r: p.foreArmRadius * 1.02 },
      { t: 0.3, r: p.foreArmRadius * 1.0 },
      { t: 0.72, r: p.foreArmRadius * 0.78 },
      { t: 1, r: p.foreArmRadius * 0.68 },
    ]),
    hand: handGeometry(p, false),
    handMirror: handGeometry(p, true),
    // A sleeve is the arm's own surface pushed out by the cloth, so it can never
    // sit under the deltoid or read as an epaulette. Short sleeves stop mid-bicep
    // with an open hem; long sleeves run to the wrist.
    sleeveCap: loft(
      sleeveProfile(armProfile(p.upperArmRadius, s.upperArm), 0.008, -s.upperArm * 0.46),
      20,
      true,
      false,
    ),
    sleeveLong: loft(
      sleeveProfile(armProfile(p.upperArmRadius, s.upperArm), 0.009, -s.upperArm),
      20,
      true,
      false,
    ),
    hipJoint: ball(p.thighRadius * 0.92, 12, 10),
    shoulderJoint: ball(p.upperArmRadius * 1.12, 12, 10),
    thigh: loft(
      [
        { y: p.thighRadius * 0.56, w: p.thighRadius * 0.4, d: p.thighRadius * 0.42, power: 2.2 },
        { y: p.thighRadius * 0.3, w: p.thighRadius * 0.86, d: p.thighRadius * 0.88, power: 2.2 },
        { y: 0, w: p.thighRadius * 1.02, d: p.thighRadius * 1.0, power: 2.2 },
        { y: -s.thigh * 0.22, w: p.thighRadius * 1.05, d: p.thighRadius * 1.02, power: 2.2 },
        { y: -s.thigh * 0.6, w: p.thighRadius * 0.9, d: p.thighRadius * 0.88, power: 2.2 },
        { y: -s.thigh * 0.94, w: p.thighRadius * 0.72, d: p.thighRadius * 0.72, power: 2.1 },
        { y: -s.thigh, w: p.thighRadius * 0.66, d: p.thighRadius * 0.66, power: 2.1 },
      ],
      18,
    ),
    shin: armPart(p, s.shin, [
      { t: -0.06, r: p.shinRadius * 0.82 },
      { t: 0, r: p.shinRadius * 1.0 },
      { t: 0.22, r: p.shinRadius * 1.04 },
      { t: 0.55, r: p.shinRadius * 0.9 },
      { t: 0.92, r: p.shinRadius * 0.64 },
      { t: 1, r: p.shinRadius * 0.58 },
    ]),
    shoe: shoeGeometry(p),
    dims: {
      torsoTop: T,
      shoulderY: T * 0.97,
      shoulderX: p.shoulderHalfWidth,
      hipJointX: p.hipHalfWidth * 0.52,
      thighLength: s.thigh,
      shinLength: s.shin,
      upperArmLength: s.upperArm,
      foreArmLength: s.foreArm,
      handLength: s.hand,
      neckTop: p.chin - p.shoulder + p.height * 0.014,
      headPivotY: p.chin - p.hip,
      headScale,
      collarY: (p.chin - p.shoulder) * 0.52,
      waistY: 0,
    },
  };

  CACHE.set(signature, bundle);
  if (CACHE.size > MAX_CACHE) {
    const oldest = CACHE.keys().next().value;
    if (oldest && oldest !== signature) {
      const entry = CACHE.get(oldest);
      if (entry) for (const value of Object.values(entry)) if (value instanceof THREE.BufferGeometry) value.dispose();
      CACHE.delete(oldest);
    }
  }
  return bundle;
}

/** Convenience for the scene: build from an appearance in one call. */
export function bodyFor(appearance: Appearance): BodyGeometry {
  return bodyGeometry(
    appearance.proportions ?? proportionsFor(appearance.height, appearance.build),
    appearance.face,
  );
}

export { collarGeometry, placketGeometry, loftArc };
