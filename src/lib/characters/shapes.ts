/**
 * Geometry primitives for the character system.
 *
 * The previous figures were assembled from `SphereGeometry` and
 * `CapsuleGeometry`, which is *why* they read as toys: a sphere has no jaw, a
 * capsule has no deltoid, and a cylinder has no waist. Every surface here is a
 * **loft**: a stack of superellipse cross-sections, each with its own width,
 * depth, forward offset and squareness. That is the same construction a
 * character modeller uses with a subdivided cage, and it is what lets a torso
 * have a ribcage, a waist and a pelvis in one continuous surface.
 *
 * Everything here is pure three.js, no React, so it can be built and inspected
 * in a script as well as in the scene.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface Section {
  /** Height along the local axis. */
  y: number;
  /** Half-width (x). */
  w: number;
  /** Half-depth (z). */
  d: number;
  /** Forward/back offset of the whole ring. */
  z?: number;
  /** Left/right offset of the whole ring. */
  x?: number;
  /**
   * Cross-section squareness. 2 = ellipse (limbs, head), 2.6–3.2 = the flatter
   * front of a torso, 4+ = a belt or a shoe sole.
   */
  power?: number;
}

const SIGN = (v: number) => (v < 0 ? -1 : 1);
const pow = (v: number, e: number) => SIGN(v) * Math.pow(Math.abs(v), e);

/** Points of one superellipse ring, in the XZ plane, at height `y`. */
function ring(section: Section, seg: number, out: number[]): void {
  const power = section.power ?? 2;
  const e = 2 / power;
  for (let j = 0; j < seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    out.push(
      (section.x ?? 0) + section.w * pow(Math.cos(a), e),
      section.y,
      (section.z ?? 0) + section.d * pow(Math.sin(a), e),
    );
  }
}

/**
 * A closed surface through a stack of sections, with optional caps.
 * UVs are cylindrical, which is enough for the material set we use (no maps).
 */
export function loft(sections: Section[], seg = 20, capTop = true, capBottom = true): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < sections.length; i++) {
    const before = positions.length / 3;
    ring(sections[i], seg, positions);
    for (let j = 0; j < seg; j++) uvs.push(j / seg, i / (sections.length - 1));
    if (i > 0) {
      const prev = before - seg;
      for (let j = 0; j < seg; j++) {
        const a = prev + j;
        const b = prev + ((j + 1) % seg);
        const c = before + ((j + 1) % seg);
        const d = before + j;
        indices.push(a, b, c, a, c, d);
      }
    }
  }

  // Caps: a fan to a centre vertex. Cheap, and they are never seen up close.
  const cap = (section: Section, ringStart: number, up: boolean) => {
    const centre = positions.length / 3;
    positions.push(section.x ?? 0, section.y, section.z ?? 0);
    uvs.push(0.5, 0.5);
    for (let j = 0; j < seg; j++) {
      const a = ringStart + j;
      const b = ringStart + ((j + 1) % seg);
      if (up) indices.push(centre, b, a);
      else indices.push(centre, a, b);
    }
  };
  if (capBottom) cap(sections[0], 0, false);
  if (capTop) cap(sections[sections.length - 1], (sections.length - 1) * seg, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * An open shell — a jacket flap, an apron, a sleeve that must not collide with
 * the arm it covers. Sweeps `startAngle`→`endAngle` (radians, 0 = +x, π/2 = +z,
 * i.e. the front) leaving the gap open.
 */
export function loftArc(
  sections: Section[],
  startAngle: number,
  endAngle: number,
  seg = 16,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const span = endAngle - startAngle;

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const power = s.power ?? 2;
    const e = 2 / power;
    const before = positions.length / 3;
    for (let j = 0; j <= seg; j++) {
      const a = startAngle + (j / seg) * span;
      positions.push((s.x ?? 0) + s.w * pow(Math.cos(a), e), s.y, (s.z ?? 0) + s.d * pow(Math.sin(a), e));
      uvs.push(j / seg, i / (sections.length - 1));
    }
    if (i > 0) {
      const prev = before - (seg + 1);
      for (let j = 0; j < seg; j++) {
        const a = prev + j;
        const b = prev + j + 1;
        const c = before + j + 1;
        const d = before + j;
        indices.push(a, b, c, a, c, d);
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

/** A limb: a loft along -Y from the joint, with a radius profile. */
export function limb(
  length: number,
  profile: Array<{ t: number; r: number; back?: number }>,
  seg = 14,
): THREE.BufferGeometry {
  const sections: Section[] = profile.map((p) => ({
    y: -length * p.t,
    w: p.r,
    d: p.r * (p.back ?? 0.94),
    power: 2.1,
  }));
  return loft(sections, seg, true, true);
}

/** Set a flat colour on every vertex. Used for lips, irises, soles, trim. */
export function paint(geometry: THREE.BufferGeometry, colour: string | THREE.Color): THREE.BufferGeometry {
  const c = colour instanceof THREE.Color ? colour : new THREE.Color(colour);
  const count = geometry.getAttribute("position").count;
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    array[i * 3] = c.r;
    array[i * 3 + 1] = c.g;
    array[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(array, 3));
  return geometry;
}

/** Paint only the vertices whose local position matches a predicate. */
export function paintWhere(
  geometry: THREE.BufferGeometry,
  colour: string | THREE.Color,
  where: (x: number, y: number, z: number) => boolean,
): THREE.BufferGeometry {
  const c = colour instanceof THREE.Color ? colour : new THREE.Color(colour);
  const pos = geometry.getAttribute("position");
  let attr = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!attr) {
    paint(geometry, "#ffffff");
    attr = geometry.getAttribute("color") as THREE.BufferAttribute;
  }
  for (let i = 0; i < pos.count; i++) {
    if (where(pos.getX(i), pos.getY(i), pos.getZ(i))) {
      attr.setXYZ(i, c.r, c.g, c.b);
    }
  }
  attr.needsUpdate = true;
  return geometry;
}

/** Bring a geometry to the attribute set the merge requires. */
function prep(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.clone();
  if (!g.getAttribute("uv")) {
    const count = g.getAttribute("position").count;
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!g.getAttribute("color")) paint(g, "#ffffff");
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  for (const name of Object.keys(g.attributes)) {
    if (!["position", "normal", "uv", "color"].includes(name)) g.deleteAttribute(name);
  }
  g.morphAttributes = {};
  return g;
}

/**
 * Bake a list of parts into one buffer.
 *
 * This is the draw-call budget: a hand of five fingers and a palm costs one
 * mesh, not six; a head with cranium, jaw, nose, ears, brow ridge and lips costs
 * one, not seven.
 */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepped = parts.map(prep);
  const merged = mergeGeometries(prepped, false);
  for (const g of prepped) g.dispose();
  if (!merged) throw new Error("character geometry merge failed");
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Convenience: a transformed clone, for placing a shared part into a merge. */
export function placed(
  geometry: THREE.BufferGeometry,
  transform: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] },
): THREE.BufferGeometry {
  const g = geometry.clone();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (transform.rotation) q.setFromEuler(new THREE.Euler(...transform.rotation));
  m.compose(
    new THREE.Vector3(...(transform.position ?? [0, 0, 0])),
    q,
    new THREE.Vector3(...(transform.scale ?? [1, 1, 1])),
  );
  g.applyMatrix4(m);
  return g;
}

/** A small sphere, used for joint fillers, buttons, curls and eyes. */
export function ball(radius: number, w = 10, h = 8): THREE.BufferGeometry {
  return new THREE.SphereGeometry(radius, w, h);
}

/** A rounded, slightly flattened slab: shoe soles, apron hems, lapels. */
export function slab(w: number, h: number, d: number, radius = 0.006): THREE.BufferGeometry {
  const r = Math.min(radius, w * 0.4, h * 0.4);
  return loft(
    [
      { y: 0, w: w * 0.82, d: d * 0.82, power: 3 },
      { y: r, w, d, power: 3.2 },
      { y: h - r, w, d, power: 3.2 },
      { y: h, w: w * 0.82, d: d * 0.82, power: 3 },
    ],
    16,
  );
}

/** Release a geometry that is no longer referenced by the cache. */
export function disposeGeometry(geometry: THREE.BufferGeometry | null | undefined): void {
  geometry?.dispose();
}

/** Bounding-box helper used by tests and by the software renderer. */
export function bounds(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  return { min: box.min.toArray(), max: box.max.toArray() };
}
