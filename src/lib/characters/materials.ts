/**
 * Materials, pooled.
 *
 * The previous character built a fresh set of ~18 `MeshStandardMaterial`s inside
 * a `useMemo` **per actor**. A busy floor therefore held hundreds of identical
 * materials, each its own GPU program lookup and its own uniform upload — and
 * a cast that grew through the evening never released them.
 *
 * Here every material is created once per *look* (a skin tone, a garment
 * colour, a hair colour) and shared by everyone who matches it. Thirty diners
 * use on the order of twenty materials between them, and the same twenty are
 * reused tomorrow.
 */

import * as THREE from "three";

const CACHE = new Map<string, THREE.MeshStandardMaterial>();

function cached(key: string, make: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const found = CACHE.get(key);
  if (found) return found;
  const made = make();
  CACHE.set(key, made);
  return made;
}

/**
 * Skin. Never a flat plastic tone: the warm subsurface term is carried by the
 * material's emissive, at a strength low enough to survive a dark dining room
 * without making faces glow.
 */
export function skinMaterial(colour: string, roughness: number, warm: string, subsurface: number) {
  return cached(`skin|${colour}|${roughness.toFixed(2)}`, () => {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      roughness,
      metalness: 0,
      envMapIntensity: 0.55,
    });
    // A hint of blood under the surface: this is the difference between skin
    // and painted plastic under a warm lamp.
    material.emissive = new THREE.Color(warm);
    material.emissiveIntensity = 0.035 * subsurface;
    return material;
  });
}

/** Lips, knuckles: the same skin, warmer and slightly glossier. */
export function lipMaterial(warm: string) {
  return cached(`lip|${warm}`, () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(warm),
      roughness: 0.42,
      metalness: 0,
      envMapIntensity: 0.4,
    }),
  );
}

/**
 * Cloth. High roughness, no metalness, low environment response — the opposite
 * of the rubbery sheen that makes a figure look like an action figure.
 */
export function clothMaterial(colour: string, roughness = 0.88) {
  return cached(`cloth|${colour}|${roughness.toFixed(2)}`, () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      roughness,
      metalness: 0,
      envMapIntensity: 0.32,
    }),
  );
}

/**
 * A jacket or a tailored trouser: a tighter weave, a little more light.
 * Double-sided because a jacket is an open shell — a single-sided one vanishes
 * when the wearer turns, which is exactly when you notice.
 */
export function tailoringMaterial(colour: string) {
  return cached(`tailoring|${colour}`, () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      roughness: 0.74,
      metalness: 0.02,
      envMapIntensity: 0.38,
      side: THREE.DoubleSide,
    }),
  );
}

/** Hair. Not plastic: deliberately rough, so it breaks up the key light. */
export function hairMaterial(colour: string, roughness = 0.58) {
  return cached(`hair|${colour}|${roughness.toFixed(2)}`, () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      roughness,
      metalness: 0,
      envMapIntensity: 0.6,
    }),
  );
}

/** Eyes: sclera and iris baked as vertex colours, matte enough to avoid a glass bead. */
export function eyeMaterial() {
  return cached("eye", () =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.38,
      metalness: 0,
      envMapIntensity: 0.3,
    }),
  );
}

/** Leather: shoes, watch straps. */
export function leatherMaterial(colour: string) {
  return cached(`leather|${colour}`, () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      roughness: 0.46,
      metalness: 0.04,
      envMapIntensity: 0.5,
    }),
  );
}

/** Glasses frames, watches, tray: the few metal accents on a figure. */
export function metalMaterial(colour = "#b9b3a8", roughness = 0.34) {
  return cached(`metal|${colour}|${roughness.toFixed(2)}`, () =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(colour),
      roughness,
      metalness: 0.85,
      envMapIntensity: 0.9,
    }),
  );
}

/** How many pooled materials exist — surfaced in the debug overlay and tests. */
export function materialCount(): number {
  return CACHE.size;
}

/** Dispose every pooled material. Called when the 3D scene unmounts. */
export function clearMaterialCache(): void {
  for (const material of CACHE.values()) material.dispose();
  CACHE.clear();
}
