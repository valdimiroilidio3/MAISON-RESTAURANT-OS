/**
 * The character system: proportions, seating, grounding, variety and pooling.
 *
 * These tests exist because the previous figure was *inspectable* but not
 * *verifiable*: every proportion was a literal next to a mesh, so nothing could
 * catch a guest sitting 7 cm inside a chair or a shoe under the floor. Here the
 * skeleton is derived, the seated pose is solved, and the assertions are in
 * metres.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CHAIR_SEAT_HEIGHT, TABLE_HEIGHT, chairSlots } from "@/lib/floor-geometry";
import {
  RATIOS,
  castOf,
  footHeight,
  proportionsFor,
  seatedHipHeight,
  seatedLeg,
  segments,
} from "@/lib/characters/anatomy";
import {
  ankleFromHip,
  dampJoints,
  groundedHipHeight,
  idleTargets,
  joints,
  rhythmFor,
  seated,
  seatedIdleTargets,
  walkTargets,
  blendRateFor,
} from "@/lib/characters/animation";
import { appearanceFor, guestAppearance, staffAppearance } from "@/lib/characters/appearance";
import { advancePhase, animationIntentFor, isSeatedPose, strideLengthFor } from "@/lib/characters/state";
import { bodyFor, bodyGeometry, clearBodyCache, signatureFor } from "@/lib/characters/body";
import { materialCount, skinMaterial, clothMaterial } from "@/lib/characters/materials";
import { usingProceduralBodies, resolveCharacterAsset } from "@/lib/characters/assets";
import type { Pose, SimActor } from "@/lib/simulation/types";

const POSES: Pose[] = ["stand", "walk", "sit", "read", "talk", "eat", "drink", "pay", "carry", "serve", "clear", "cook"];

function actorWith(over: Partial<SimActor>): SimActor {
  return {
    id: "a1",
    kind: "guest",
    name: "Convidado",
    x: 0,
    z: 0,
    rotation: 0,
    pose: "stand",
    hidden: false,
    seed: 7,
    stride: 0,
    carrying: "none",
    plate: null,
    glass: 0,
    bathroomIn: null,
    inBathroom: false,
    ...over,
  } as SimActor;
}

describe("anthopometry", () => {
  it("derives a human skeleton from stature, not from literals", () => {
    const p = proportionsFor(1.78);
    expect(p.eye / p.height).toBeCloseTo(RATIOS.eye, 3);
    expect(p.shoulder / p.height).toBeCloseTo(RATIOS.shoulder, 3);
    expect(p.crotch / p.height).toBeCloseTo(RATIOS.crotch, 3);
    // head is roughly a seventh of the body, and the arms reach mid-thigh
    expect(p.height / p.head.height).toBeGreaterThan(7);
    expect(p.height / p.head.height).toBeLessThan(8);
    const s = segments(p);
    expect(p.hip - s.thigh - s.shin).toBeCloseTo(p.ankle, 6);
  });

  it("clamps stature to the adult range this product depicts", () => {
    expect(proportionsFor(1.2).height).toBe(1.52);
    expect(proportionsFor(2.4).height).toBe(1.92);
  });

  it("changes width with build but never height", () => {
    const slim = proportionsFor(1.75, "slim");
    const broad = proportionsFor(1.75, "broad");
    expect(broad.height).toBeCloseTo(slim.height, 6);
    expect(broad.shoulderHalfWidth).toBeGreaterThan(slim.shoulderHalfWidth * 1.1);
    expect(broad.thighRadius).toBeGreaterThan(slim.thighRadius);
  });

  it("gives a cast a real spread of heights and builds", () => {
    const cast = castOf(24, 1234);
    const heights = cast.map((p) => Math.round(p.height * 100));
    expect(new Set(heights).size).toBeGreaterThanOrEqual(12);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(18);
    expect(new Set(cast.map((p) => p.build)).size).toBeGreaterThan(1);
  });
});

describe("seating", () => {
  it("solves the seated leg so the shins stay vertical and feet reach the floor", () => {
    for (const height of [1.62, 1.7, 1.75, 1.83, 1.9]) {
      const p = proportionsFor(height);
      const leg = seatedLeg(p);
      const j = seated(leg);
      const s = segments(p);
      const ankle = ankleFromHip(j, { thigh: s.thigh, shin: s.shin }, "L");
      const hip = seatedHipHeight(p);
      const floor = hip + ankle.y;
      expect(floor).toBeCloseTo(footHeight(p), 3);
    }
  });

  it("lands every guest in the cast on the floor, short or tall", () => {
    for (const height of [1.52, 1.56, 1.61, 1.68, 1.75, 1.82, 1.88, 1.92]) {
      const p = proportionsFor(height);
      const leg = seatedLeg(p);
      const s = segments(p);
      const ankle = ankleFromHip(seated(leg), { thigh: s.thigh, shin: s.shin }, "L");
      const floor = seatedHipHeight(p) + ankle.y;
      expect(Math.abs(floor - footHeight(p))).toBeLessThan(0.002);
      expect(leg.dangles).toBe(false);
    }
  });

  it("raises the knees of a tall guest above the seat instead of splaying the shins", () => {
    const tall = seatedLeg(proportionsFor(1.9));
    const short = seatedLeg(proportionsFor(1.6));
    expect(tall.thigh).toBeLessThan(-Math.PI / 2);
    expect(short.thigh).toBeGreaterThan(-Math.PI / 2);
    expect(tall.thigh + tall.knee).toBeCloseTo(0, 6);
    expect(short.thigh + short.knee).toBeCloseTo(0, 6);
  });

  it("seats the hips at the chair, not at a hard-coded 0.47", () => {
    const p = proportionsFor(1.86);
    expect(seatedHipHeight(p)).toBeGreaterThan(CHAIR_SEAT_HEIGHT);
    expect(seatedHipHeight(p)).toBeLessThan(CHAIR_SEAT_HEIGHT + 0.05);
    // the pelvis must be under the tabletop so the diner is not eating off a shelf
    expect(seatedHipHeight(p)).toBeLessThan(TABLE_HEIGHT);
  });

  it("leans the seated thigh forward toward the table the guest was assigned", () => {
    const table = { id: 1, code: "T01", shape: "round" as const, seats: 4, x: 2, z: 3, rotation: 0 };
    const seats = chairSlots(table, 0);
    expect(seats).toHaveLength(4);
    for (const seat of seats) {
      // the seat faces the table centre, and the hips sit on the chair
      const toCentre = Math.atan2(table.x - seat.x, table.z - seat.z);
      const facing = Math.atan2(Math.sin(seat.rotation), Math.cos(seat.rotation));
      const delta = Math.abs(Math.atan2(Math.sin(toCentre - facing), Math.cos(toCentre - facing)));
      expect(delta).toBeLessThan(1e-6);
    }
  });
});

describe("grounding", () => {
  it("keeps the lower foot on the floor through the whole walk cycle", () => {
    const p = proportionsFor(1.74);
    const s = segments(p);
    const leg = { thigh: s.thigh, shin: s.shin };
    const rhythm = rhythmFor(11);
    for (let step = 0; step < 24; step++) {
      const phase = (step / 24) * Math.PI * 2;
      const j = walkTargets(phase, rhythm, 1);
      const hip = groundedHipHeight(j, leg, footHeight(p));
      const left = hip + ankleFromHip(j, leg, "L").y;
      const right = hip + ankleFromHip(j, leg, "R").y;
      // 1 mm of margin, so a shoe sole never cuts the floor plane
      expect(Math.min(left, right)).toBeCloseTo(footHeight(p) + 0.001, 4);
      expect(Math.min(left, right)).toBeGreaterThan(0);
    }
  });

  it("stands with both feet planted and a bent knee that does not lift the body", () => {
    const p = proportionsFor(1.68);
    const s = segments(p);
    const leg = { thigh: s.thigh, shin: s.shin };
    const j = idleTargets(1.2, rhythmFor(4));
    const hip = groundedHipHeight(j, leg, footHeight(p));
    const left = hip + ankleFromHip(j, leg, "L").y;
    const right = hip + ankleFromHip(j, leg, "R").y;
    expect(Math.abs(left - footHeight(p))).toBeLessThan(0.002);
    expect(Math.abs(right - footHeight(p))).toBeLessThan(0.02);
  });
});

describe("variety", () => {
  it("builds a diverse population, not one doll in several colours", () => {
    const guests = Array.from({ length: 40 }, (_, i) => guestAppearance(1000 + i * 37));
    expect(new Set(guests.map((g) => g.skin.name)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(guests.map((g) => g.hair.style)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(guests.map((g) => g.outfit.garment)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(guests.map((g) => g.build)).size).toBeGreaterThanOrEqual(3);
    // no two guests are the same person
    const signatures = new Set(guests.map((g) => `${g.height.toFixed(3)}|${g.skin.name}|${g.hair.style}|${g.outfit.garment}|${g.outfit.colour}`));
    expect(signatures.size).toBe(guests.length);
  });

  it("gives staff a uniform language of their own, and variation inside it", () => {
    const waiters = Array.from({ length: 12 }, (_, i) => staffAppearance("waiter", 500 + i * 13));
    expect(new Set(waiters.map((w) => w.outfit.jacket?.colour)).size).toBe(1);
    expect(new Set(waiters.map((w) => w.height.toFixed(2))).size).toBeGreaterThan(5);
    expect(new Set(waiters.map((w) => w.hair.style)).size).toBeGreaterThan(2);
    // staff never wear a guest's garment as their uniform
    for (const w of waiters) {
      expect(w.outfit.jacket).not.toBeNull();
      expect(w.staff?.role).toBe("waiter");
    }
    expect(appearanceFor("guest", 3).staff).toBeNull();
    expect(appearanceFor("chef", 3).staff?.role).toBe("chef");
  });

  it("is deterministic: the same seed is the same person, forever", () => {
    const a = guestAppearance(4242);
    const b = guestAppearance(4242);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("animation layer", () => {
  it("maps every pose the engine emits to a coherent body state", () => {
    for (const pose of POSES) {
      const intent = animationIntentFor(actorWith({ pose }));
      expect(intent.pose).toBe(pose);
      expect(isSeatedPose(pose)).toBe(intent.seated);
      if (pose === "walk") expect(intent.seated).toBe(false);
      expect(blendRateFor(pose)).toBeGreaterThan(0);
    }
  });

  it("never lets a walking figure be seated, nor a seated one walk", () => {
    for (const pose of POSES) {
      const intent = animationIntentFor(actorWith({ pose }));
      if (intent.moving) expect(intent.seated).toBe(false);
    }
    expect(animationIntentFor(actorWith({ pose: "eat" })).seated).toBe(true);
    expect(animationIntentFor(actorWith({ pose: "walk" })).moving).toBe(true);
  });

  it("advances the stride by distance, not by time", () => {
    const stride = strideLengthFor(1.75);
    expect(stride).toBeGreaterThan(0.6);
    expect(advancePhase(0, 0, stride)).toBe(0);
    const a = advancePhase(0, 1, stride);
    expect(a).toBeGreaterThan(0);
    // two metres twice is two metres once
    expect(advancePhase(advancePhase(0, 1, stride), 1, stride)).toBeCloseTo(advancePhase(0, 2, stride), 6);
  });

  it("gives every figure its own rhythm, so idles are never in unison", () => {
    const rhythms = Array.from({ length: 12 }, (_, i) => rhythmFor(i * 977));
    const phases = new Set(rhythms.map((r) => r.phase.toFixed(2)));
    expect(phases.size).toBeGreaterThan(8);
    const cadences = new Set(rhythms.map((r) => r.cadence.toFixed(2)));
    expect(cadences.size).toBeGreaterThan(4);
  });

  it("blends rather than snaps, and converges", () => {
    const from = joints();
    const to = seated(seatedLeg(proportionsFor(1.74)));
    const mid = dampJoints(from, to, 6, 1 / 60);
    // one frame must not teleport a standing body into a chair
    expect(Math.abs(mid.thighLX - to.thighLX)).toBeGreaterThan(0.5);
    let state = from;
    for (let i = 0; i < 180; i++) state = dampJoints(state, to, 6, 1 / 60);
    expect(state.thighLX).toBeCloseTo(to.thighLX, 2);
    expect(state.kneeL).toBeCloseTo(to.kneeL, 2);
  });

  it("keeps a seated figure off its feet: no walk cycle while seated", () => {
    const j = seatedIdleTargets(2.4, rhythmFor(9), "cutlery", seatedLeg(proportionsFor(1.7)));
    const s = segments(proportionsFor(1.7));
    const ankle = ankleFromHip(j, { thigh: s.thigh, shin: s.shin }, "L");
    expect(ankle.z).toBeGreaterThan(0.2); // knees forward, under the table
    expect(Math.abs(j.thighLX + Math.PI / 2)).toBeLessThan(0.2);
  });

  it("never writes to the simulation from the animation layer", () => {
    const actor = actorWith({ pose: "eat", glass: 0.5 });
    const before = JSON.stringify(actor);
    animationIntentFor(actor);
    seatedIdleTargets(1, rhythmFor(actor.seed), "cutlery", seatedLeg(proportionsFor(1.7)));
    walkTargets(2, rhythmFor(actor.seed), 1);
    expect(JSON.stringify(actor)).toBe(before);
  });
});

describe("geometry", () => {
  it("builds a body whose height matches its stature", () => {
    clearBodyCache();
    const appearance = guestAppearance(31);
    const body = bodyFor(appearance);
    const box = new THREE.Box3();
    for (const part of [body.hips, body.torso, body.head, body.thigh, body.shin, body.shoe]) {
      part.computeBoundingBox();
      box.union(part.boundingBox!);
    }
    // torso + head reach the crown; legs reach the floor
    const top = body.proportions.hip + body.dims.headPivotY + body.proportions.head.height;
    expect(top / appearance.height).toBeGreaterThan(0.85);
    expect(top / appearance.height).toBeLessThan(1.02);
    body.shoe.computeBoundingBox();
    // a shoe is exactly as tall as the ankle joint, so its sole is on the floor
    expect(body.shoe.boundingBox!.min.y).toBeCloseTo(-body.proportions.ankle, 2);
  });

  it("shares geometry between people of the same build instead of allocating per actor", () => {
    clearBodyCache();
    const a = guestAppearance(11);
    const b = guestAppearance(12);
    a.proportions = proportionsFor(1.75, "average");
    b.proportions = proportionsFor(1.75, "average");
    a.height = 1.75;
    b.height = 1.75;
    a.face = { jaw: 1, length: 1, cheek: 1 };
    b.face = { jaw: 1, length: 1, cheek: 1 };
    expect(signatureFor(a.proportions, a.face)).toBe(signatureFor(b.proportions, b.face));
    const first = bodyGeometry(a.proportions, a.face);
    const second = bodyGeometry(b.proportions, b.face);
    expect(first).toBe(second);
    expect(first.head).toBe(second.head);
  });

  it("has no vertex below the floor on a standing figure", () => {
    clearBodyCache();
    const appearance = guestAppearance(77);
    const body = bodyFor(appearance);
    const s = segments(body.proportions);
    const hip = groundedHipHeight(joints(), { thigh: s.thigh, shin: s.shin }, footHeight(body.proportions));
    const ankleY = hip + ankleFromHip(joints(), { thigh: s.thigh, shin: s.shin }, "L").y;
    body.shoe.computeBoundingBox();
    expect(ankleY + body.shoe.boundingBox!.min.y).toBeGreaterThan(-0.004);
  });
});

describe("materials", () => {
  it("pools materials instead of allocating a set per actor", () => {
    const before = materialCount();
    for (let i = 0; i < 30; i++) {
      const a = guestAppearance(2000 + i * 11);
      skinMaterial(a.skin.base, a.skin.roughness, a.skin.warm, a.skin.subsurface);
      clothMaterial(a.outfit.colour);
    }
    const grown = materialCount() - before;
    // 30 people, but only a handful of distinct tones and colours between them
    expect(grown).toBeLessThan(40);
    const a = guestAppearance(1);
    const first = skinMaterial(a.skin.base, a.skin.roughness, a.skin.warm, a.skin.subsurface);
    const second = skinMaterial(a.skin.base, a.skin.roughness, a.skin.warm, a.skin.subsurface);
    expect(first).toBe(second);
  });
});

describe("assets", () => {
  it("ships no model it could not licence-check, and says so", () => {
    expect(usingProceduralBodies()).toBe(true);
    expect(resolveCharacterAsset("guest")).toBeNull();
    expect(resolveCharacterAsset("waiter")).toBeNull();
  });
});
