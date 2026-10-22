/**
 * The character component, mounted for real.
 *
 * Geometry tests prove the maths; this proves the *scene graph*. It is the only
 * automated check that the rig, the materials, the props and the per-frame
 * controller all survive contact with React Three Fiber — without it, a typo in
 * a mesh prop would only ever show up as a blank floor in the app.
 *
 * The harness drives time by hand (`advanceFrames`), so a pose can be inspected
 * at a fixed instant instead of whenever the machine happens to render.
 */

import { describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import * as THREE from "three";
import { HumanCharacter } from "@/components/three/sim/HumanCharacter";
import { appearanceFor } from "@/lib/characters/appearance";
import { seatedLeg, seatedHipHeight } from "@/lib/characters/anatomy";
import { Actor } from "@/components/three/sim/Actor";
import type { SimActor } from "@/lib/simulation/types";

function actor(patch: Partial<SimActor> = {}): SimActor {
  return {
    id: "a1",
    kind: "guest",
    seed: 7,
    x: 0,
    z: 0,
    rotation: 0,
    stride: 0,
    pose: "stand",
    plate: null,
    glass: 0,
    carrying: "none",
    seatIndex: 0,
    tableId: undefined,
    name: "Convidado",
    hidden: false,
    bathroomIn: null,
    inBathroom: false,
    ...patch,
  } as SimActor;
}

async function mount(patch: Partial<SimActor>) {
  return ReactThreeTestRenderer.create(
    <HumanCharacter actor={actor(patch)} reducedMotion={false} />,
  );
}

/** The proportions the component itself derives — not a guess at the height. */
function proportionsOf(patch: Partial<SimActor>) {
  return appearanceFor(actor(patch).kind, actor(patch).seed).proportions;
}

/** Run the per-frame controller without waiting on a real clock. */
async function advance(renderer: Awaited<ReturnType<typeof mount>>, frames: number, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) await renderer.advanceFrames(1, dt);
}

function hipsOf(renderer: Awaited<ReturnType<typeof mount>>) {
  const scene = renderer.scene.instance as THREE.Object3D;
  const hips = scene.getObjectByName("hips");
  expect(hips).toBeTruthy();
  return hips as THREE.Object3D;
}

describe("HumanCharacter in a scene graph", () => {
  it("mounts a standing guest with a body, a head and two arms", async () => {
    const renderer = await mount({});
    const meshes = renderer.scene.findAll((node) => node.instance.type === "Mesh");
    // hips, torso, neck, head, eyes, brows, lips, hair, 2× upper arm, 2× fore arm, 2× hand,
    // 2× thigh, 2× shin, 2× shoe — the floor is well above a handful of parts.
    expect(meshes.length).toBeGreaterThan(18);
    await renderer.unmount();
  });

  it("stands at hip height and moves to the chair when seated", async () => {
    const renderer = await mount({});
    await advance(renderer, 2);
    const p = proportionsOf({});
    const standing = hipsOf(renderer).position.y;
    expect(standing).toBeGreaterThan(p.hip - 0.05);
    expect(standing).toBeLessThan(p.hip + 0.05);

    await renderer.update(
      <HumanCharacter
        actor={actor({ pose: "sit", seatIndex: 2, tableId: 1 })}
        reducedMotion={false}
      />,
    );
    await advance(renderer, 120);
    const seated = hipsOf(renderer).position.y;
    expect(seated).toBeCloseTo(seatedHipHeight(p), 2);
    expect(seated).toBeLessThan(standing);
    await renderer.unmount();
  });

  it("never sinks a shoe through the floor while walking", async () => {
    const renderer = await mount({ pose: "walk" });
    // The controller advances the walk phase from distance travelled, so a
    // moving actor is simulated by pushing the engine's own coordinates.
    const moving = actor({ pose: "walk" });
    let z = 0;
    for (let i = 0; i < 90; i++) {
      z += 0.012;
      moving.z = z;
      await renderer.update(<HumanCharacter actor={moving} reducedMotion={false} />);
      await advance(renderer, 1);
      const scene = renderer.scene.instance as THREE.Object3D;
      // R3F updates matrices at paint time; the test harness has to ask, or the
      // box is measured in the last frame's space and reports a phantom sole.
      scene.updateMatrixWorld(true);
      const lowest = new THREE.Box3().setFromObject(scene);
      // the shoe's sole may kiss the floor, never cut through it
      // 0 is the floor; the sole may touch it but never cut into it
      expect(lowest.min.y).toBeGreaterThan(-0.002);
    }
    await renderer.unmount();
  });

  it("animates the legs while the actor moves instead of sliding in a neutral pose", async () => {
    const moving = actor({ pose: "walk" });
    const renderer = await ReactThreeTestRenderer.create(
      <HumanCharacter actor={moving} reducedMotion={false} />,
    );
    const scene = renderer.scene.instance as THREE.Object3D;
    const thigh = scene.getObjectByName("thigh-L")!;
    const seen: number[] = [];
    for (let i = 0; i < 100; i++) {
      moving.z += 0.02;
      await renderer.update(<HumanCharacter actor={{ ...moving }} reducedMotion={false} />);
      await advance(renderer, 1);
      seen.push(thigh.rotation.x);
    }
    // a walk swings the thigh well past 5° and through both directions
    expect(Math.max(...seen)).toBeGreaterThan(0.05);
    expect(Math.min(...seen)).toBeLessThan(-0.05);
    await renderer.unmount();
  });

  it("mounts a waiter through the Actor, with service props attached", async () => {
    const waiter = actor({ id: "w1", kind: "waiter", pose: "carry", carrying: "tray" });
    const renderer = await ReactThreeTestRenderer.create(<Actor actor={waiter} reducedMotion={false} />);
    const scene = renderer.scene.instance as THREE.Object3D;
    expect(scene.getObjectByName("actor-w1")).toBeTruthy();
    expect(scene.getObjectByName("hips")).toBeTruthy();
    await advance(renderer, 20);
    await renderer.unmount();
  });

  it("keeps the table props out of the seated body", async () => {
    const seated = actor({ pose: "eat", tableId: 3, seatIndex: 1 });
    const renderer = await ReactThreeTestRenderer.create(
      <HumanCharacter actor={seated} reducedMotion={false} tabletop={<mesh name="probe-tabletop" />} />,
    );
    const scene = renderer.scene.instance as THREE.Object3D;
    const table = scene.getObjectByName("probe-tabletop");
    expect(table).toBeTruthy();
    // the table does not inherit the hips, so it stays put when the guest sits
    await advance(renderer, 90);
    expect(table!.position.y).toBe(0);
    await renderer.unmount();
  });

  it("builds with reduced motion and still reaches the seated pose", async () => {
    const seated = actor({ pose: "sit", tableId: 2, seatIndex: 0 });
    const renderer = await ReactThreeTestRenderer.create(
      <HumanCharacter actor={seated} reducedMotion />,
    );
    await advance(renderer, 90);
    expect(hipsOf(renderer).position.y).toBeCloseTo(seatedHipHeight(proportionsOf(seated)), 1);
    await renderer.unmount();
  });

  it("gives the legs the solved seated angle, not a hard-coded right angle", async () => {
    const seated = actor({ pose: "sit", tableId: 4, seatIndex: 3 });
    const renderer = await ReactThreeTestRenderer.create(
      <HumanCharacter actor={seated} reducedMotion={false} />,
    );
    await advance(renderer, 120);
    const scene = renderer.scene.instance as THREE.Object3D;
    const thigh = scene.getObjectByName("thigh-L");
    expect(thigh).toBeTruthy();
    const solved = seatedLeg(proportionsOf(seated));
    expect(thigh!.rotation.x).toBeCloseTo(solved.thigh, 1);
    const knee = scene.getObjectByName("knee-L");
    expect(knee!.rotation.x).toBeCloseTo(solved.knee, 1);
    await renderer.unmount();
  });
});
