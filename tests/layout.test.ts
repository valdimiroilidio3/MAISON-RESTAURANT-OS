import { describe, expect, it } from "vitest";
import { chairSlots, tableDimensions, type SceneTable } from "@/components/three/room-types";
import { getPublicFloor } from "@/lib/public-data";

const floor = getPublicFloor();
const tables: SceneTable[] = floor.tables;

describe("seeded floor layout", () => {
  it("seeds a full dining room across the three zones", () => {
    expect(tables.length).toBe(20);
    expect(floor.zones.length).toBe(3);
    expect(floor.capacity).toBe(tables.reduce((sum, t) => sum + t.seats, 0));
  });

  it("gives every table a unique code and finite coordinates inside the room shell", () => {
    const codes = new Set(tables.map((t) => t.code));
    expect(codes.size).toBe(tables.length);
    for (const table of tables) {
      expect(Number.isFinite(table.x), table.code).toBe(true);
      expect(Number.isFinite(table.z), table.code).toBe(true);
      expect(Math.abs(table.x), table.code).toBeLessThan(15);
      expect(Math.abs(table.z), table.code).toBeLessThan(15);
    }
  });

  it("places exactly one chair per seat around every table", () => {
    for (const table of tables) {
      expect(chairSlots(table, table.id), table.code).toHaveLength(table.seats);
    }
  });

  it("keeps chairs outside the tabletop footprint", () => {
    for (const table of tables) {
      const dims = tableDimensions(table);
      const clearance = table.shape === "round" ? dims.radius : dims.width / 2;
      for (const slot of chairSlots(table, table.id)) {
        expect(Math.hypot(slot.x, slot.z), table.code).toBeGreaterThan(clearance);
      }
    }
  });

  it("does not overlap tables inside the same zone", () => {
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const a = tables[i];
        const b = tables[j];
        if (a.zoneSlug !== b.zoneSlug) continue;
        const da = tableDimensions(a);
        const db = tableDimensions(b);
        const ra = a.shape === "round" ? da.radius : Math.hypot(da.width, da.depth) / 2;
        const rb = b.shape === "round" ? db.radius : Math.hypot(db.width, db.depth) / 2;
        const distance = Math.hypot(a.x - b.x, a.z - b.z);
        expect(distance, `${a.code} vs ${b.code}`).toBeGreaterThan((ra + rb) * 0.75);
      }
    }
  });

  it("is deterministic so server and client agree", () => {
    const a = chairSlots(tables[3], tables[3].id);
    const b = chairSlots(tables[3], tables[3].id);
    expect(a).toEqual(b);
  });
});
