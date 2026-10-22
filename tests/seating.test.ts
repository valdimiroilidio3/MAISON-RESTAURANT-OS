/**
 * Seating intelligence.
 *
 * The allocator used to take the first free table ordered by size, which is a
 * database answer to a spatial question. These tests pin the properties a
 * maître d' would check: the party gets a table that fits, quiet tables win over
 * noisy ones, a zone request is honoured, and the same request always returns
 * the same table.
 */

import { describe, expect, it } from "vitest";
import { LANDMARKS, TABLES, type TableLike } from "@/lib/scene/layout";
import { computeSeatPlan } from "@/lib/scene/placement";
import {
  accessDistance,
  daylightAt,
  exposureAt,
  neighbourClearance,
  rankTables,
  scoreTable,
  suggestTable,
  type SeatingCandidate,
} from "@/lib/scene/seating";

const candidates: SeatingCandidate[] = TABLES as SeatingCandidate[];
const all = TABLES as TableLike[];
const seatPlan = computeSeatPlan(all);

const byCode = (code: string) => candidates.find((table) => table.code === code)!;

describe("spatial signals", () => {
  it("gives the terrace full daylight and back-of-room tables very little", () => {
    expect(daylightAt(-9.4, -5.6)).toBeGreaterThan(0.95); // terrace
    expect(daylightAt(8.8, 4.8)).toBeGreaterThan(0.6); // beside the east glazing
    expect(daylightAt(3.9, -3.9)).toBeLessThan(0.35); // deep in the bar zone
  });

  it("measures noise from the real service points", () => {
    const nearBar = exposureAt(LANDMARKS.counter.x, LANDMARKS.counter.z);
    const farTerrace = exposureAt(-9.4, 3.4);
    expect(nearBar).toBeGreaterThan(0.5);
    expect(farTerrace).toBeLessThan(0.25);
  });

  it("keeps the clearance measure consistent with the seat solver", () => {
    const clearance = neighbourClearance(byCode("T01"), all, seatPlan);
    expect(clearance).toBeGreaterThan(0.2);
    expect(clearance).toBeLessThan(4);
  });

  it("prefers tables closer to the entrance for the access axis", () => {
    expect(accessDistance(byCode("T19"))).toBeLessThan(accessDistance(byCode("T01")));
  });
});

describe("ranking", () => {
  it("never returns a table that cannot hold the party", () => {
    const ranked = rankTables(candidates, 8, { all, seatPlan });
    for (const scored of ranked) expect(scored.table.seats).toBeGreaterThanOrEqual(8);
    const two = rankTables(candidates, 2, { all, seatPlan });
    expect(two.length).toBeGreaterThan(0);
    for (const scored of two) expect(scored.table.seats).toBeGreaterThanOrEqual(2);
  });

  it("does not give a party of 2 a 6-top while a 2-top is free", () => {
    const best = suggestTable(candidates, 2, { all, seatPlan })!;
    expect(best.table.seats).toBeLessThanOrEqual(4);
  });

  it("honours an explicit zone request", () => {
    const best = suggestTable(candidates, 2, { all, seatPlan, preferences: { zone: "esplanada" } })!;
    expect(best.table.zone).toBe("esplanada");
    expect(best.reasons.join(" ")).toMatch(/esplanada/i);
  });

  it("prefers a quieter table when the guest asks for quiet", () => {
    const loud = suggestTable(candidates, 2, { all, seatPlan })!;
    const quiet = suggestTable(candidates, 2, { all, seatPlan, preferences: { quiet: true } })!;
    const exposure = (table: { x: number; z: number }) => exposureAt(table.x, table.z);
    expect(exposure(quiet.table)).toBeLessThanOrEqual(exposure(loud.table) + 0.001);
  });

  it("never suggests an occupied table", () => {
    const busy = new Set(candidates.map((table) => table.id));
    expect(rankTables(candidates, 4, { all, seatPlan, unavailable: busy })).toHaveLength(0);
  });

  it("is deterministic and stable across runs", () => {
    const a = rankTables(candidates, 4, { all, seatPlan });
    const b = rankTables([...candidates].reverse(), 4, { all, seatPlan });
    expect(a.map((scored) => scored.table.code)).toEqual(b.map((scored) => scored.table.code));
  });

  it("explains itself in Portuguese, with at most three reasons", () => {
    const scored = scoreTable(byCode("T13"), 2, { all, seatPlan });
    expect(scored.score).toBeGreaterThan(0);
    expect(scored.score).toBeLessThanOrEqual(100);
    expect(scored.reasons.length).toBeGreaterThan(0);
    expect(scored.reasons.length).toBeLessThanOrEqual(3);
    for (const reason of scored.reasons) expect(reason).toMatch(/[a-zA-ZÀ-ú]/);
  });

  it("keeps every axis within 0–100", () => {
    for (const scored of rankTables(candidates, 4, { all, seatPlan })) {
      for (const [axis, value] of Object.entries(scored.breakdown)) {
        expect(value, `${scored.table.code} ${axis}`).toBeGreaterThanOrEqual(0);
        expect(value, `${scored.table.code} ${axis}`).toBeLessThanOrEqual(100);
      }
    }
  });
});
