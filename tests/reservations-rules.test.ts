import { describe, expect, it } from "vitest";
import {
  addDaysToDateString,
  fitsParty,
  generateSlots,
  hasTableConflict,
  intervalsOverlap,
  intervalOf,
  isPastDate,
  isWithinService,
} from "@/lib/reservations-rules";

describe("service windows", () => {
  it("generates 30-minute slots across lunch and dinner", () => {
    const slots = generateSlots();
    expect(slots[0]).toBe("12:00");
    expect(slots).toContain("14:30");
    expect(slots).toContain("19:00");
    expect(slots[slots.length - 1]).toBe("22:00");
    expect(slots).toHaveLength(13);
  });

  it("rejects times outside service", () => {
    expect(isWithinService("12:00")).toBe(true);
    expect(isWithinService("15:00")).toBe(false);
    expect(isWithinService("23:30")).toBe(false);
  });
});

describe("conflict detection", () => {
  const existing = [
    { id: 1, tableId: 5, time: "20:00", status: "confirmed" },
    { id: 2, tableId: 6, time: "19:00", status: "cancelled" },
  ];

  it("blocks overlapping bookings on the same table", () => {
    expect(hasTableConflict(existing, { time: "20:30", tableId: 5 })).not.toBeNull();
    expect(hasTableConflict(existing, { time: "19:00", tableId: 5 })).not.toBeNull();
  });

  it("allows bookings after the turnover window", () => {
    expect(hasTableConflict(existing, { time: "21:30", tableId: 5 })).toBeNull();
  });

  it("ignores cancelled reservations and other tables", () => {
    expect(hasTableConflict(existing, { time: "19:30", tableId: 6 })).toBeNull();
    expect(hasTableConflict(existing, { time: "20:00", tableId: 7 })).toBeNull();
  });

  it("can exclude the reservation being edited", () => {
    expect(hasTableConflict(existing, { time: "20:00", tableId: 5, ignoreId: 1 })).toBeNull();
  });

  it("treats back-to-back intervals as free", () => {
    const a = intervalOf("20:00");
    const b = intervalOf("21:30");
    expect(intervalsOverlap(a, b)).toBe(false);
  });
});

describe("party and dates", () => {
  it("requires enough seats", () => {
    expect(fitsParty(4, 4)).toBe(true);
    expect(fitsParty(2, 4)).toBe(false);
  });

  it("adds days without timezone drift", () => {
    expect(addDaysToDateString("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDateString("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("compares ISO dates", () => {
    expect(isPastDate("2026-10-20", "2026-10-21")).toBe(true);
    expect(isPastDate("2026-10-21", "2026-10-21")).toBe(false);
  });
});
