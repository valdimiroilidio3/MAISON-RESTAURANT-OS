/**
 * Hair, as geometry.
 *
 * The first attempt built hair from open shells swept round the skull. It looked
 * like cardboard, because it was: a shell with an open edge has no volume, and
 * its edge reads as a cut-out however carefully it is placed.
 *
 * This builds each style as **one closed shell** whose lower boundary is a real
 * hairline — high across the forehead, lower at the temples, falling to the nape,
 * and irregular enough that two heads never share an outline. Long styles simply
 * keep descending past the jaw with the radius held, which is how hair hangs.
 *
 * Built in head units (y = 0 at the chin, y = 1 at the crown) so the same style
 * fits every skull; the scene scales the whole group by that person's head.
 */

import * as THREE from "three";
import { ball, loft, merge, placed, type Section } from "./shapes";
import { HEAD_UNIT, skullAt } from "./headProfile";
import type { HairStyle } from "./appearance";

/** A closed shell from a per-angle lower edge up over the crown. */
function shell(edgeY: (angle: number) => number, rings: number, expand: number, seg = 26): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const radiusAt = (y: number) => {
    // Hair has volume: it leaves the skull at the crown and thickens as it falls,
    // which is what separates a hairstyle from a painted-on cap.
    const volume = 1 + Math.max(0, 0.32 - y) * 0.55;
    // Below the jaw the skull table collapses to the chin; hair instead hangs
    // straight, so the radius holds at the widest point of the head above it.
    if (y >= 0.28) return { w: skullAt(y).w * expand * volume, d: skullAt(y).d * expand * volume };
    const base = skullAt(0.28);
    const hang = Math.max(0.9, 1 + y * 0.1);
    return { w: base.w * expand * volume * hang, d: base.d * expand * volume * hang };
  };

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const bottom = edgeY(a);
      // Ease from the hairline to the crown; the crown ring is pulled in so the
      // surface closes over the skull rather than ending in a flat disc.
      const y = bottom + (1.0 - bottom) * Math.pow(t, 0.86);
      const r = radiusAt(y);
      // Close the crown instead of leaving the shell open — an open shell shows
      // a bald patch straight through the top of the head.
      const crownPinch =
        y > 0.8 ? Math.max(0.22, Math.sqrt(Math.max(0.001, 1 - Math.pow((y - 0.8) / 0.2, 2)))) : 1;
      positions.push(Math.cos(a) * r.w * crownPinch, y, Math.sin(a) * r.d * crownPinch - 0.008);
      uvs.push(j / seg, t);
      if (i > 0) {
        const cur = i * seg + j;
        const prev = (i - 1) * seg + j;
        const curNext = i * seg + ((j + 1) % seg);
        const prevNext = (i - 1) * seg + ((j + 1) % seg);
        indices.push(prev, prevNext, curNext, prev, curNext, cur);
      }
    }
  }
  // Cap the crown ring: an open shell shows a hole from above, and a ball stuck
  // on top reads as a bun on every head.
  const centre = positions.length / 3;
  positions.push(0, 1.0, -0.008);
  uvs.push(0.5, 1);
  for (let j = 0; j < seg; j++) {
    indices.push(rings * seg + j, rings * seg + ((j + 1) % seg), centre);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The hairline. `angle` runs round the head: π/2 is the forehead, 3π/2 the nape.
 * `irregular` is the person's 0–1 variant, which shifts the parting and breaks
 * the line so it never reads as a moulded cap.
 */
function hairline(style: HairStyle, irregular: number): (angle: number) => number {
  const base: Record<HairStyle, { front: number; temple: number; side: number; back: number }> = {
    // The hairline sits high on the forehead — roughly 0.86 of head height at the
    // centre — and falls to the nape at the back. Getting this wrong is what
    // makes hair look like a helmet pulled down over the eyes.
    bald: { front: 0.94, temple: 0.94, side: 0.94, back: 0.72 },
    cropped: { front: 0.9, temple: 0.84, side: 0.72, back: 0.5 },
    short: { front: 0.865, temple: 0.8, side: 0.66, back: 0.44 },
    receding: { front: 0.93, temple: 0.76, side: 0.64, back: 0.44 },
    "side-part": { front: 0.875, temple: 0.78, side: 0.64, back: 0.42 },
    shoulder: { front: 0.87, temple: 0.78, side: -0.16, back: -0.4 },
    bob: { front: 0.87, temple: 0.76, side: 0.04, back: 0.0 },
    bun: { front: 0.865, temple: 0.8, side: 0.66, back: 0.46 },
    curls: { front: 0.865, temple: 0.8, side: 0.66, back: 0.44 },
    ponytail: { front: 0.865, temple: 0.8, side: 0.66, back: 0.46 },
  };
  const b = base[style];

  return (angle: number) => {
    // s = 1 at the forehead, -1 at the nape, 0 at the sides
    const s = Math.sin(angle);
    const frontness = Math.pow(Math.max(0, s), 1.4);
    const backness = Math.pow(Math.max(0, -s), 1.4);
    const sideNess = 1 - Math.abs(s);
    // The temples sit between the forehead line and the side line.
    const temple = Math.max(0, 1 - Math.abs(Math.abs(s) - 0.62) / 0.38);
    let y = b.side * sideNess * (1 - temple * 0.6) + b.front * frontness + b.back * backness + b.temple * temple * 0.6;
    // A parting and an uneven fringe: 1–2 cm of variation, not a decal.
    const wobble = Math.sin(angle * 3 + irregular * 6.3) * 0.022 + Math.sin(angle * 7 - irregular * 2.1) * 0.01;
    y += wobble * (backness > 0.9 ? 0.4 : 1);
    if (style === "receding") {
      // widow's peak at the centre, retreat at the temples
      y += Math.cos(angle * 2) * 0.05 * frontness;
    }
    if (style === "bald") y = Math.max(y, 0.9);
    return y;
  };
}

/** Build a hairstyle. `variant` (0–1, from the seed) changes volume and line. */
export function hairGeometry(style: HairStyle, variant = 0.5): THREE.BufferGeometry | null {
  const v = Math.max(0, Math.min(1, variant));
  const edge = hairline(style, v);
  const expand = 1.045 + v * 0.03;

  switch (style) {
    case "bald":
      // only the fringe of hair above the ears survives
      return shell((a) => Math.max(edge(a), 0.92), 5, 1.02, 24);

    case "cropped":
      return shell(edge, 7, 1.025);

    case "receding":
      return shell(edge, 8, 1.03);

    case "short":
      return merge([shell(edge, 9, expand)]);

    case "side-part":
      return shell(edge, 9, 1.06);

    case "curls": {
      const parts: THREE.BufferGeometry[] = [shell(edge, 9, 1.06)];
      // clusters of curls breaking the silhouette
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2.1 + v * 1.4;
        const t = 0.34 + (((i * 37) % 100) / 100) * 0.6;
        const y = 0.5 + t * 0.48;
        const r = skullAt(y);
        const k = 1.12;
        parts.push(
          placed(ball(0.048 + ((i * 13) % 7) * 0.004, 8, 6), {
            position: [Math.cos(a) * r.w * k, y, Math.sin(a) * r.d * k - 0.008],
          }),
        );
      }
      return merge(parts);
    }

    case "bun":
      return merge([
        shell(edge, 9, 1.04),
        placed(ball(0.15, 14, 12), { position: [0, 0.66, -0.33], scale: [1, 0.9, 0.92] }),
        placed(ball(0.055, 10, 8), { position: [0, 0.55, -0.29] }),
      ]);

    case "ponytail":
      return merge([
        shell(edge, 9, 1.04),
        placed(ball(0.07, 10, 8), { position: [0, 0.7, -0.3] }),
        placed(
          loft([
            { y: 0, w: 0.075, d: 0.08 },
            { y: -0.2, w: 0.085, d: 0.09 },
            { y: -0.42, w: 0.07, d: 0.075 },
            { y: -0.6 - v * 0.12, w: 0.03, d: 0.035 },
          ], 12),
          { position: [0, 0.62, -0.34], rotation: [-0.5, 0, 0.04] },
        ),
      ]);

    case "bob":
    case "shoulder":
    default:
      return shell(edge, 12, expand);
  }
}

/**
 * A band of surface between two per-angle heights: stubble, a beard, a shadow
 * along the jaw. Built as a closed strip so it can never show a cut edge.
 */
function bandShell(
  lower: (angle: number) => number,
  upper: (angle: number) => number,
  rings: number,
  expand: number,
  seg = 24,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const lo = lower(a);
      const hi = upper(a);
      const y = lo + (hi - lo) * t;
      const r = skullAt(Math.max(0.06, y));
      positions.push(Math.cos(a) * r.w * expand, y, Math.sin(a) * r.d * expand - 0.006);
      uvs.push(j / seg, t);
      if (i > 0) {
        const cur = i * seg + j;
        const prev = (i - 1) * seg + j;
        const curNext = i * seg + ((j + 1) % seg);
        const prevNext = (i - 1) * seg + ((j + 1) % seg);
        indices.push(prev, prevNext, curNext, prev, curNext, cur);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Facial hair, in the same head units, anchored to the jaw surface. */
export function facialHairGeometry(
  kind: "stubble" | "moustache" | "beard" | "goatee" | "none",
): THREE.BufferGeometry | null {
  if (kind === "none") return null;

  // The front half of the face, from the chin up to the cheek line; the back of
  // the head is excluded by collapsing the band to nothing behind the ears.
  const frontOnly = (a: number) => (Math.sin(a) < -0.1 ? 0.97 : 1);

  const jaw = (top: number) =>
    bandShell(
      (a) => (Math.sin(a) < -0.1 ? 0.97 : 0.02),
      (a) => (Math.sin(a) < -0.1 ? 0.97 : top * frontOnly(a)),
      5,
      1.008,
    );

  switch (kind) {
    case "stubble":
      return jaw(0.3);
    case "beard":
      return merge([
        jaw(0.42),
        // the beard hangs a little below the chin
        bandShell(
          (a) => (Math.sin(a) < -0.1 ? 0.97 : -0.06),
          (a) => (Math.sin(a) < -0.1 ? 0.97 : 0.06),
          3,
          1.01,
        ),
      ]);
    case "goatee":
      return merge([
        placed(ball(0.042, 10, 8), { position: [0, 0.1, 0.052], scale: [1, 0.85, 0.5] }),
        placed(
          loft([
            { y: 0, w: 0.046, d: 0.008 },
            { y: 0.014, w: 0.054, d: 0.011 },
            { y: 0.024, w: 0.034, d: 0.007 },
          ], 10),
          { position: [0, 0.262, 0.06] },
        ),
      ]);
    case "moustache":
    default:
      return placed(
        loft([
          { y: 0, w: 0.058, d: 0.009 },
          { y: 0.016, w: 0.07, d: 0.012 },
          { y: 0.028, w: 0.05, d: 0.008 },
        ], 10),
        { position: [0, 0.262, 0.06] },
      );
  }
}

export { HEAD_UNIT, shell as hairShell };
