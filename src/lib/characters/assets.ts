/**
 * Character asset seam.
 *
 * **Read this before looking for a GLB that is not here.**
 *
 * The brief names four Sketchfab references. From the environment this build was
 * produced in, `sketchfab.com`, `api.sketchfab.com`, `media.sketchfab.com` and
 * `models.sketchfab.com` are all unreachable (every request returns 000), so the
 * models could not be opened, licence-checked, downloaded or measured. None of
 * them is bundled, and none of them is embedded as an iframe — an iframe would
 * not be a Three.js integration and the brief rules it out.
 *
 * Rather than pretend, the character system is written so a licensed, rigged
 * GLB can be dropped in without touching the scene: add an entry to
 * `CHARACTER_MANIFEST`, and `resolveCharacterAsset` starts returning it. Until
 * then every actor is built from the procedural body in `body.ts`, which is the
 * only asset this build can legally ship.
 *
 * A model only becomes eligible when **all** of the following are true, and each
 * one is recorded in the manifest so the choice is auditable later:
 *   1. a licence that permits commercial use *and* redistribution inside a
 *      bundled application (CC0, or a paid licence with redistribution rights);
 *   2. a skeleton with named humanoid bones, and at least idle/walk/sit clips;
 *   3. a scale and orientation we can verify against our own floor;
 *   4. a triangle count that fits the frame budget on a laptop.
 */

export interface CharacterAssetEntry {
  /** Who or what this asset is licensed from, for the report. */
  source: string;
  /** Evidence of the licence: URL or a short quotation of the terms. */
  licence: string;
  /** Public path of the GLB. */
  url: string;
  /** Metres from floor to crown, as measured on the model. */
  heightMetres: number;
  /** Rotation needed to face +Z, in radians. */
  yawOffset: number;
  /** Clip names the animation controller may use. */
  clips: { idle?: string; walk?: string; sit?: string; stand?: string; eat?: string; serve?: string };
  triangles: number;
}

/**
 * Empty on purpose. Every entry here must be one we could licence-check and
 * measure; an unchecked model is worse than no model.
 */
export const CHARACTER_MANIFEST: Record<string, CharacterAssetEntry> = {};

/**
 * Resolve the asset for a kind of character, if one has been approved.
 * Returns `null` when the procedural body should be used — which is every
 * character in this build.
 */
export function resolveCharacterAsset(kind: string): CharacterAssetEntry | null {
  const entry = CHARACTER_MANIFEST[kind];
  if (!entry) return null;
  // Guard the contract: half-specified entries fall back rather than half-work.
  if (!entry.url || !entry.clips.idle || !entry.clips.walk) return null;
  return entry;
}

/** True when the scene is running entirely on procedural bodies. */
export function usingProceduralBodies(): boolean {
  return Object.keys(CHARACTER_MANIFEST).length === 0;
}
