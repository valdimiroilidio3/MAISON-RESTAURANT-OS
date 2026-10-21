// @vitest-environment jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React from "react";
import { describe, expect, it } from "vitest";
import { act, create } from "@react-three/test-renderer";
import { DiningRoomScene, type RoomQuality } from "@/components/three/Room";
import { chairSlots, tableDimensions, type SceneTable, type SceneZone } from "@/components/three/room-types";
import { getPublicFloor } from "@/lib/public-data";

const zones: SceneZone[] = [
  { id: 1, name: "Salão", slug: "salao" },
  { id: 2, name: "Balcão", slug: "balcao" },
  { id: 3, name: "Esplanada", slug: "esplanada" },
];

/** Rendering fixture — real geometry/layout numbers are asserted in layout.test.ts. */
const tables: SceneTable[] = Array.from({ length: 12 }, (_, index) => {
  const statuses = ["available", "reserved", "occupied", "order_pending", "awaiting_payment", "cleaning"] as const;
  const zone = zones[index % zones.length];
  const round = index % 3 !== 0;
  return {
    id: index + 1,
    code: `T${String(index + 1).padStart(2, "0")}`,
    seats: round ? 2 + (index % 3) : 4,
    shape: round ? "round" : "rect",
    x: ((index % 4) - 1.5) * 2.8,
    z: (Math.floor(index / 4) - 1) * 3.4,
    rotation: round ? 0 : index % 2 === 0 ? 0 : Math.PI / 2,
    zoneSlug: zone.slug,
    zoneName: zone.name,
    status: statuses[index % statuses.length],
    guests: index % 3 === 0 ? 2 : undefined,
  };
});

type TestRenderer = Awaited<ReturnType<typeof create>>;

const FULL_QUALITY: RoomQuality = { shadows: true, guests: true, candles: true, labels: true };
const LOW_QUALITY: RoomQuality = { shadows: false, guests: false, candles: false, labels: false };

async function render(props: Partial<React.ComponentProps<typeof DiningRoomScene>> = {}) {
  const renderer = await create(
    <DiningRoomScene
      tables={tables}
      zones={zones}
      mode="operations"
      selectedId={null}
      dimZone={null}
      onSelect={() => {}}
      onHover={() => {}}
      quality={FULL_QUALITY}
      reducedMotion={false}
      {...props}
    />,
  );
  await act(async () => {
    await renderer.advanceFrames(3, 1 / 30);
  });
  return renderer;
}

function findGroup(renderer: TestRenderer, name: string) {
  let found: any = null;
  const walk = (object: any) => {
    if (!object) return;
    if (object.name === name) found = object;
    (object.children ?? []).forEach(walk);
  };
  renderer.scene.children.forEach((c: { instance: unknown }) => walk(c.instance));
  return found;
}

function walkAll(renderer: TestRenderer) {
  const out: any[] = [];
  const walk = (object: any) => {
    out.push(object);
    (object.children ?? []).forEach(walk);
  };
  renderer.scene.children.forEach((c: { instance: unknown }) => walk(c.instance));
  return out;
}

describe("3D dining room scene", () => {
  it("renders one selectable group per table with real geometry", async () => {
    const renderer = await render();
    const nodes = walkAll(renderer);

    for (const table of tables) {
      expect(findGroup(renderer, `table-${table.code}`), `missing table group ${table.code}`).toBeTruthy();
    }

    const meshes = nodes.filter((n) => n.isMesh);
    expect(meshes.length).toBeGreaterThan(tables.length * 4);

    // every table needs a ring mesh so status is never only conveyed by colour
    const rings = meshes.filter((m) => m.geometry?.type === "RingGeometry");
    expect(rings.length).toBeGreaterThanOrEqual(tables.length);
  });

  it("keeps the light budget fixed instead of adding a light per table", async () => {
    const high = walkAll(await render({ quality: FULL_QUALITY })).filter((n) => n.isLight);
    const low = walkAll(await render({ quality: LOW_QUALITY })).filter((n) => n.isLight);

    // High: ambient + hemisphere + directional + 3 practicals + spot + 2 chandeliers + bar + kitchen
    expect(high.length).toBeLessThanOrEqual(12);
    expect(high.filter((l) => l.type === "PointLight").length).toBeLessThanOrEqual(8);
    // the count must not grow with the number of tables
    expect(high.length).toBeLessThan(tables.length);
    // Low: a minimal rig (ambient/hemisphere/directional + two practical fill lights)
    expect(low.length).toBeLessThanOrEqual(5);
    expect(low.length).toBeLessThan(high.length);
  });

  it("culls guests on low quality without dropping the furniture", async () => {
    const full = await render({ quality: FULL_QUALITY });
    const low = await render({ quality: LOW_QUALITY });

    const fullGroups = walkAll(full).filter((n) => n.isGroup).length;
    const lowGroups = walkAll(low).filter((n) => n.isGroup).length;
    expect(lowGroups).toBeLessThan(fullGroups);

    for (const table of tables) {
      expect(findGroup(low, `table-${table.code}`)).toBeTruthy();
    }
  });

  it("renders without guest meshes when quality.guests is off", async () => {
    const withGuests = await render({ quality: FULL_QUALITY });
    const withoutGuests = await render({ quality: LOW_QUALITY });
    const count = (r: TestRenderer) => walkAll(r).filter((n) => n.name === "guest").length;
    expect(count(withGuests)).toBeGreaterThan(0);
    expect(count(withoutGuests)).toBe(0);
  });

  it("marks the selected and dimmed states visually", async () => {
    const target = tables[0];
    const renderer = await render({ selectedId: target.id, dimZone: "salao" });
    const rings = walkAll(renderer).filter((n) => n.isMesh && n.geometry?.type === "RingGeometry");
    const opacities = new Set(rings.map((r) => (r.material as any)?.opacity));
    expect(opacities.has(0.95)).toBe(true); // selected ring
    expect(opacities.has(0.12)).toBe(true); // dimmed ring
  });

  it("highlights the hovered table with its own ring", async () => {
    const target = tables[2];
    const renderer = await render({ hoveredId: target.id });
    const rings = walkAll(renderer).filter((n) => n.isMesh && n.geometry?.type === "RingGeometry");
    const opacities = rings.map((r) => (r.material as any)?.opacity);
    expect(opacities).toContain(0.7);
  });

  it("survives reduced motion and preview mode", async () => {
    const renderer = await render({ reducedMotion: true, mode: "preview", quality: LOW_QUALITY });
    await act(async () => {
      await renderer.advanceFrames(4, 1 / 30);
    });
    expect(walkAll(renderer).filter((n) => n.isMesh).length).toBeGreaterThan(50);
  });
});
