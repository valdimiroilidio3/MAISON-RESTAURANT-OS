// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The floor scene is asserted structurally, not aesthetically: the tests below
 * check that the room is built from the canonical layout (one shell, one table
 * per plan row, chairs exactly where the solver put them) and that the render
 * budget cannot silently grow with the data.
 */

import React from "react";
import { describe, expect, it } from "vitest";
import { act, create } from "@react-three/test-renderer";
import { DiningRoom, type RoomQuality } from "@/components/three/world/DiningRoom";
import type { SceneTable, SceneZone } from "@/components/three/room-types";
import { OPENINGS, PARTITIONS, TABLES } from "@/lib/scene/layout";
import { computeSeatPlan, plannedSeats } from "@/lib/scene/placement";

const zones: SceneZone[] = [
  { id: 1, name: "Esplanada", slug: "esplanada" },
  { id: 2, name: "Sala", slug: "salao" },
  { id: 3, name: "Balcão", slug: "balcao" },
];

const tables: SceneTable[] = TABLES.map((table) => ({
  id: table.id,
  code: table.code,
  seats: table.seats,
  shape: table.shape,
  x: table.x,
  z: table.z,
  rotation: table.rotation,
  zoneSlug: table.zone,
  zoneName: zones.find((zone) => zone.slug === table.zone)?.name ?? table.zone,
  status: table.id % 3 === 0 ? "reserved" : "available",
}));

type TestRenderer = Awaited<ReturnType<typeof create>>;

const FULL_QUALITY: RoomQuality = { shadows: true, guests: true, candles: true, labels: true };
const LOW_QUALITY: RoomQuality = { shadows: false, guests: false, candles: false, labels: false, practicals: false };

async function render(props: Partial<React.ComponentProps<typeof DiningRoom>> = {}) {
  const renderer = await create(
    <DiningRoom
      tables={tables}
      zones={zones}
      mode="operations"
      selectedId={null}
      dimZone={null}
      onSelect={() => {}}
      onHover={() => {}}
      quality={FULL_QUALITY}
      reducedMotion={false}
      daylight={1}
      {...props}
    />,
  );
  await act(async () => {
    await renderer.advanceFrames(2, 1 / 30);
  });
  return renderer;
}

function walkAll(renderer: TestRenderer) {
  const out: any[] = [];
  const walk = (object: any) => {
    out.push(object);
    (object.children ?? []).forEach(walk);
  };
  renderer.scene.children.forEach((child: { instance: unknown }) => walk(child.instance));
  return out;
}

function named(renderer: TestRenderer, name: string) {
  return walkAll(renderer).filter((node) => node.name === name);
}

describe("dining room scene", () => {
  it("is one room: a single shell, not a copy per view", async () => {
    const renderer = await render();
    expect(named(renderer, "shell")).toHaveLength(1);
    expect(named(renderer, "floors")).toHaveLength(1);
    expect(named(renderer, "fixtures")).toHaveLength(1);
    expect(named(renderer, "tables")).toHaveLength(1);
    expect(named(renderer, "maison-dining-room")).toHaveLength(1);
  });

  it("builds every partition and opening of the layout, and nothing else", async () => {
    const renderer = await render();
    const walls = walkAll(renderer).filter((node) => String(node.name ?? "").startsWith("wall-"));
    expect(walls).toHaveLength(PARTITIONS.length);
    const openings = walkAll(renderer).filter((node) => String(node.name ?? "").startsWith("opening-"));
    expect(openings).toHaveLength(OPENINGS.length);
  });

  it("draws one table per plan row and no phantom tables", async () => {
    const renderer = await render();
    const groups = walkAll(renderer).filter((node) => String(node.name ?? "").startsWith("table-"));
    expect(groups).toHaveLength(TABLES.length);
    for (const table of TABLES) {
      expect(named(renderer, `table-${table.code}`), `missing ${table.code}`).toHaveLength(1);
    }
  });

  it("places every chair exactly where the seat solver says", async () => {
    const renderer = await render();
    const seats = TABLES.flatMap((table) => plannedSeats(table, computeSeatPlan(TABLES)));
    const instanced = walkAll(renderer).filter(
      (node) => node.isInstancedMesh && node.children?.every?.(() => true) !== false && node.count === seats.length,
    );
    expect(instanced.length, "expected one instanced chair mesh with one instance per seat").toBeGreaterThanOrEqual(1);

    const chairMesh = instanced[0];
    const matrix = new (await import("three")).Matrix4();
    const position = new (await import("three")).Vector3();
    // spot-check the first, middle and last seat of the plan
    for (const index of [0, Math.floor(seats.length / 2), seats.length - 1]) {
      chairMesh.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix);
      expect(position.x).toBeCloseTo(seats[index].x, 4);
      expect(position.z).toBeCloseTo(seats[index].z, 4);
    }
  });

  it("keeps the light budget fixed regardless of how many tables exist", async () => {
    const full = walkAll(await render()).filter((node) => node.isLight);
    const low = walkAll(await render({ quality: LOW_QUALITY })).filter((node) => node.isLight);

    // sun + bounce + ambient + hemisphere + 5 practicals + 5 candle fills
    expect(full.length).toBeLessThanOrEqual(14);
    expect(full.filter((light) => light.type === "PointLight").length).toBeLessThanOrEqual(10);
    expect(full.length).toBeLessThan(TABLES.length);
    expect(low.length).toBeLessThanOrEqual(14);
  });

  it("marks selection and zone dimming with geometry, not with text", async () => {
    const clean = walkAll(await render());
    const selected = walkAll(await render({ selectedId: tables[0].id, dimZone: "salao" }));

    const gold = selected.filter(
      (node) => node.isMesh && node.geometry?.type === "RingGeometry" && node.material?.color?.getHexString?.() === "c6a66b",
    );
    expect(gold.length).toBeGreaterThanOrEqual(2);

    // dim veils: every table outside the filtered zone
    const veil = (nodes: any[]) =>
      nodes.filter((node) => node.isMesh && node.geometry?.type === "CircleGeometry" && node.material?.opacity === 0.5);
    expect(veil(clean)).toHaveLength(0);
    expect(veil(selected).length).toBe(tables.filter((table) => table.zoneSlug !== "salao").length);
  });

  it("renders a closed sky dome instead of flat billboards", async () => {
    const renderer = await render();
    const spheres = walkAll(renderer).filter((node) => node.isMesh && node.geometry?.type === "SphereGeometry");
    // the two dome shells are drawn on the inside (THREE.BackSide = 1)
    const dome = spheres.filter((node) => node.material?.side === 1);
    expect(dome.length).toBeGreaterThanOrEqual(2);
    // …and they are big enough to enclose the room rather than sit inside it
    for (const shell of dome) expect(shell.geometry.parameters.radius).toBeGreaterThan(60);
  });

  it("survives preview mode and a night frame", async () => {
    const renderer = await render({ mode: "preview", daylight: 0, quality: LOW_QUALITY });
    await act(async () => {
      await renderer.advanceFrames(4, 1 / 30);
    });
    expect(walkAll(renderer).filter((node) => node.isMesh).length).toBeGreaterThan(50);
  });
});
