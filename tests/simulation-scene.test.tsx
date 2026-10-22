// @vitest-environment jsdom
/**
 * Mounts the real React Three Fiber tree of the live room (no WebGL needed) to
 * make sure the scene graph is valid: one group per table, actors on stage,
 * chairs and tableware present, and re-renders that follow the cast.
 */

import { expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { SimulationWorld } from "@/components/three/sim/SimulationScene";
import { Simulation } from "@/lib/simulation/engine";
import { TABLE_PLAN } from "@/lib/scene/layout";
import type { SimProduct, SimTable } from "@/lib/simulation/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A hermetic fixture drawn from the real plan (six tables) so the scene, the
// nav grid and the assertions all agree on where furniture is. Coordinates are
// copied from TABLE_PLAN on purpose: a stale copy is exactly the drift this
// test is meant to catch.
const FIXTURE_CODES = ["T01", "T04", "T07", "T10", "T14", "T16"];
const tables: SimTable[] = TABLE_PLAN.filter((table) => FIXTURE_CODES.includes(table.code)).map((table, index) => ({
  id: index + 1,
  code: table.code,
  seats: table.seats,
  shape: table.shape,
  x: table.x,
  z: table.z,
  rotation: table.rotation,
  zoneSlug: table.zone,
  zoneName: table.zone,
}));

const products: SimProduct[] = [
  { id: 1, name: "Entrada", priceCents: 900, category: "Entradas" },
  { id: 2, name: "Prato", priceCents: 1850, category: "Pratos" },
  { id: 3, name: "Sobremesa", priceCents: 700, category: "Sobremesas" },
  { id: 4, name: "Vinho", priceCents: 550, category: "Bar" },
];

function liveSim() {
  const sim = new Simulation({
    tables,
    products,
    startWeekday: 3,
    startMinutes: 12 * 60,
    startDate: "2026-10-22",
    seed: 11,
    speed: 1,
  });
  // 40 restaurant-minutes: the first tables fill up and orders are taken.
  sim.tick(20 * 60_000);
  sim.tick(20 * 60_000);
  return sim;
}

it("mounts the live room: one group per table, chairs, tableware and actors", async () => {
  const sim = liveSim();
  const cast = () => sim.actors.filter((actor) => !actor.hidden && !actor.inBathroom).length;
  expect(cast()).toBeGreaterThan(0);

  const renderer = await ReactThreeTestRenderer.create(
    <SimulationWorld
      sim={sim}
      castCount={cast()}
      quality={{ shadows: false, lamps: false }}
      reducedMotion={false}
      focusedTableId={1}
      light={{ current: { dayLight: 1 } }}
    />,
  );

  const tableGroups = renderer.scene.findAll((node) => String(node.instance.name ?? "").startsWith("table-"));
  const actorGroups = renderer.scene.findAll((node) => String(node.instance.name ?? "").startsWith("actor-"));
  const meshes = renderer.scene.findAllByType("Mesh");

  // the room is always drawn from the canonical plan, even when a service only
  // runs on a subset of tables
  expect(tableGroups).toHaveLength(TABLE_PLAN.length);
  expect(actorGroups).toHaveLength(cast());
  // room shell + fixtures + one instanced chair mesh + tableware + actors
  expect(meshes.length).toBeGreaterThan(200);

  await renderer.unmount();
});

it("adds new actors when the cast grows and survives a night lighting frame", async () => {
  const sim = liveSim();
  const cast = () => sim.actors.filter((actor) => !actor.hidden && !actor.inBathroom).length;
  const light = { current: { dayLight: 1 } };
  const renderer = await ReactThreeTestRenderer.create(
    <SimulationWorld
      sim={sim}
      castCount={cast()}
      quality={{ shadows: false, lamps: false }}
      reducedMotion
      focusedTableId={null}
      light={light}
    />,
  );
  const before = renderer.scene.findAll((node) => String(node.instance.name ?? "").startsWith("actor-")).length;

  for (let i = 0; i < 6; i++) sim.tick(5 * 60_000);
  light.current.dayLight = 0;
  await renderer.update(
    <SimulationWorld
      sim={sim}
      castCount={cast()}
      quality={{ shadows: false, lamps: false }}
      reducedMotion
      focusedTableId={null}
      light={light}
    />,
  );
  await renderer.advanceFrames(2, 0.016);

  const after = renderer.scene.findAll((node) => String(node.instance.name ?? "").startsWith("actor-")).length;
  expect(after).toBe(cast());
  expect(after).not.toBe(before);

  await renderer.unmount();
});
