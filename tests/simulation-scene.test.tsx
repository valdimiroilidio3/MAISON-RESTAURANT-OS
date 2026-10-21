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
import type { SimProduct, SimTable } from "@/lib/simulation/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A hermetic fixture (six tables) so the scene test never touches SQLite.
const tables: SimTable[] = [
  { id: 1, code: "T01", seats: 2, shape: "round", x: -9.4, z: -5.6, rotation: 0, zoneSlug: "esplanada", zoneName: "Esplanada" },
  { id: 2, code: "T02", seats: 4, shape: "rect", x: -6.6, z: -2.8, rotation: 0, zoneSlug: "esplanada", zoneName: "Esplanada" },
  { id: 3, code: "T03", seats: 4, shape: "round", x: -2.6, z: -3.6, rotation: 0, zoneSlug: "sala", zoneName: "Sala" },
  { id: 4, code: "T04", seats: 2, shape: "round", x: 0.7, z: -0.4, rotation: 0, zoneSlug: "sala", zoneName: "Sala" },
  { id: 5, code: "T05", seats: 6, shape: "rect", x: 5.4, z: -0.5, rotation: 0, zoneSlug: "balcao", zoneName: "Balcão" },
  { id: 6, code: "T06", seats: 2, shape: "round", x: 6.7, z: 1.9, rotation: 0, zoneSlug: "balcao", zoneName: "Balcão" },
];

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

  expect(tableGroups).toHaveLength(tables.length);
  expect(actorGroups).toHaveLength(cast());
  // 2 guests per table seat + chairs + plates + cutlery + room furniture
  expect(meshes.length).toBeGreaterThan(300);

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
