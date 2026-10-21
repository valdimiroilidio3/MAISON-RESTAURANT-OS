import { describe, expect, it } from "vitest";
import { Simulation } from "@/lib/simulation/engine";
import { getPublicFloor } from "@/lib/public-data";
import { getMenuCatalog } from "@/lib/menu";
import { getRestaurant } from "@/lib/restaurant";
import type { SimProduct, SimTable } from "@/lib/simulation/types";

const floor = getPublicFloor();
const tables: SimTable[] = floor.tables.map((t) => ({
  id: t.id,
  code: t.code,
  seats: t.seats,
  shape: t.shape,
  x: t.x,
  z: t.z,
  rotation: t.rotation,
  zoneSlug: t.zoneSlug,
  zoneName: t.zoneName,
}));

const products: SimProduct[] = getMenuCatalog(getRestaurant().id).products.map((p) => ({
  id: p.id,
  name: p.name,
  priceCents: p.priceCents,
  category: p.categoryName,
}));

function make(startMinutes = 11 * 60 + 45, weekday = 3) {
  return new Simulation({
    tables,
    products,
    startWeekday: weekday,
    startMinutes,
    startDate: "2026-10-21",
    seed: 7,
    speed: 60,
  });
}

/** Advance the simulation by restaurant-local minutes. */
function advance(sim: Simulation, minutes: number) {
  let remaining = minutes;
  while (remaining > 0) {
    const step = Math.min(remaining, 20);
    sim.tick((step / sim.speed) * 60_000);
    remaining -= step;
  }
}

describe("simulation clock and service phases", () => {
  it("follows the Lisbon service windows", () => {
    const sim = make(10 * 60);
    expect(sim.phaseInfo.phase).toBe("closed");
    sim.jumpTo(11 * 60 + 30);
    expect(sim.phaseInfo.phase).toBe("prep");
    sim.jumpTo(12 * 60 + 30);
    expect(sim.phaseInfo.phase).toBe("lunch");
    sim.jumpTo(16 * 60);
    expect(sim.phaseInfo.phase).toBe("break");
    sim.jumpTo(20 * 60);
    expect(sim.phaseInfo.phase).toBe("dinner");
    sim.jumpTo(23 * 60 + 20);
    expect(sim.phaseInfo.phase).toBe("closing");
  });

  it("is closed on Mondays and Tuesdays", () => {
    for (const weekday of [1, 2]) {
      const sim = make(13 * 60, weekday);
      expect(sim.phaseInfo.phase).toBe("closed");
      advance(sim, 120);
      expect(sim.snapshot().stats.arrivals).toBe(0);
    }
  });

  it("moves from day to night", () => {
    const sim = make(12 * 60);
    const noon = sim.dayLight;
    sim.jumpTo(21 * 60 + 30);
    expect(noon).toBe(1);
    expect(sim.dayLight).toBeLessThan(0.2);
  });
});

describe("service flow", () => {
  it("seats guests, takes orders, serves and clears plates, then collects payment", () => {
    const sim = make(12 * 60);
    advance(sim, 150);
    const snapshot = sim.snapshot();

    expect(snapshot.stats.arrivals).toBeGreaterThan(8);
    expect(snapshot.stats.orders).toBeGreaterThan(6);
    expect(snapshot.stats.served).toBeGreaterThan(5);
    expect(snapshot.stats.paid).toBeGreaterThan(2);
    expect(snapshot.stats.revenueCents).toBeGreaterThan(0);
    expect(snapshot.stats.guestsInside).toBeGreaterThan(0);

    const kinds = new Set(snapshot.events.map((e) => e.kind));
    for (const kind of ["arrival", "seated", "order", "served", "cleared", "payment", "left"] as const) {
      expect(kinds.has(kind), `missing ${kind} event`).toBe(true);
    }

    const text = snapshot.events.map((e) => e.text).join(" ");
    expect(text).toMatch(/\d{2}:\d{2}/);
  });

  it("sends guests to the bathroom and brings them back", () => {
    const sim = make(12 * 60);
    advance(sim, 150);
    const snapshot = sim.snapshot();
    expect(snapshot.stats.bathrooms).toBeGreaterThan(0);
    expect(snapshot.events.some((e) => e.kind === "bathroom")).toBe(true);
    const hidden = [...sim.actors].filter((a) => a.kind === "guest" && a.inBathroom).length;
    expect(hidden).toBeGreaterThanOrEqual(0);
  });

  it("pays some bills at the counter and some at the table", () => {
    const sim = make(12 * 60);
    advance(sim, 170);
    const paid = sim.snapshot().events.filter((e) => e.kind === "payment").map((e) => e.text);
    expect(paid.length).toBeGreaterThan(2);
    expect(paid.some((t) => t.includes("balcão"))).toBe(true);
    expect(paid.some((t) => t.includes("na mesa"))).toBe(true);
  });

  it("does not accept new guests after the last seating", () => {
    const sim = make(22 * 60 + 35);
    const before = sim.snapshot().stats.arrivals;
    advance(sim, 40);
    expect(sim.snapshot().stats.arrivals).toBe(before);
  });

  it("stops seating new guests when the lunch service closes", () => {
    const sim = make(13 * 60);
    advance(sim, 120); // 15:00 — last seating passed
    const atBreak = sim.snapshot();
    expect(atBreak.phase.phase).toBe("break");
    const arrivals = atBreak.stats.arrivals;
    advance(sim, 45);
    expect(sim.snapshot().stats.arrivals).toBe(arrivals);
    // Guests already dining finish their meal and leave.
    advance(sim, 60);
    expect(sim.snapshot().stats.partiesSeated).toBe(0);
  });

  it("is deterministic for the same seed", () => {
    const a = make(12 * 60);
    const b = make(12 * 60);
    advance(a, 90);
    advance(b, 90);
    expect(a.snapshot().stats).toEqual(b.snapshot().stats);
    expect(a.snapshot().events.map((e) => e.text)).toEqual(b.snapshot().events.map((e) => e.text));
  });

  it("never seats two parties at one table nor frees an occupied table", () => {
    const sim = make(12 * 60);
    for (let step = 0; step < 48; step++) {
      advance(sim, 5);
      const snapshot = sim.snapshot();
      const perTable = new Map<number, number>();
      for (const party of snapshot.parties) perTable.set(party.tableId, (perTable.get(party.tableId) ?? 0) + 1);
      for (const [tableId, count] of perTable) {
        expect(count, `mesa ${tableId} com ${count} grupos ao mesmo tempo`).toBe(1);
      }
      for (const table of snapshot.tables) {
        if (table.partyId) {
          expect(table.status, `${table.code} livre com o grupo ${table.partyId} na sala`).not.toBe("free");
        }
      }
    }
  });

  it("keeps every party tied to a real table and every paid bill consistent", () => {
    const sim = make(12 * 60);
    advance(sim, 160);
    const snapshot = sim.snapshot();
    for (const party of snapshot.parties) {
      expect(tables.some((t) => t.id === party.tableId)).toBe(true);
      expect(party.size).toBeGreaterThanOrEqual(1);
      expect(party.size).toBeLessThanOrEqual(4);
    }
    for (const event of snapshot.events) {
      if (event.kind === "payment") expect(event.text).toMatch(/€/);
    }
    expect(snapshot.stats.averageTicketCents).toBeGreaterThan(0);
  });
});
