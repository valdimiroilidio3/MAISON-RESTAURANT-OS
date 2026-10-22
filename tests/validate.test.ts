/**
 * The spatial validator has two jobs, and both are tested here:
 *  1. the canonical room passes (otherwise the build would gate on a false alarm);
 *  2. each rule actually fires when it should (otherwise "0 findings" is not
 *     evidence of anything).
 *
 * Negative cases are created by moving one table by hand — never by weakening a
 * rule — so the test proves the rule, not the tolerance.
 */

import { describe, expect, it } from "vitest";
import { FIXTURES, OPENINGS, ROOM_BOUNDS, TABLES, type TableLike } from "@/lib/scene/layout";
import { computeSeatPlan } from "@/lib/scene/placement";
import { formatReport, validateScene, type Severity } from "@/lib/scene/validate";
import { auditFloor } from "@/lib/scene/audit";

const tables = TABLES as TableLike[];
const seatPlan = computeSeatPlan(tables);

function codes(report: ReturnType<typeof validateScene>, rule: string) {
  return report.findings.filter((finding) => finding.rule === rule).map((finding) => finding.subject);
}

describe("canonical floor", () => {
  it("has no critical, high or medium findings", () => {
    const report = validateScene({ tables, seatPlan });
    const summary = (["critical", "high", "medium"] as Severity[]).map(
      (severity) => `${severity}: ${report.findings.filter((finding) => finding.severity === severity).length}`,
    );
    expect(summary, formatReport(report)).toEqual(["critical: 0", "high: 0", "medium: 0"]);
    expect(report.ok).toBe(true);
  });

  it("checks every table and returns the plan it validated against", () => {
    const report = validateScene({ tables, seatPlan });
    expect(report.tables).toBe(tables.length);
    expect(report.seatPlan.size).toBe(tables.length);
  });

  it("sums to 72 seats, the number the menu and reservations assume", () => {
    expect(tables.reduce((total, table) => total + table.seats, 0)).toBe(72);
  });

  it("keeps every fixture inside the room", () => {
    for (const fixture of FIXTURES) {
      expect(fixture.footprint.minX, fixture.id).toBeGreaterThanOrEqual(ROOM_BOUNDS.minX);
      expect(fixture.footprint.maxX, fixture.id).toBeLessThanOrEqual(ROOM_BOUNDS.maxX);
      expect(fixture.footprint.minZ, fixture.id).toBeGreaterThanOrEqual(ROOM_BOUNDS.minZ);
      expect(fixture.footprint.maxZ, fixture.id).toBeLessThanOrEqual(ROOM_BOUNDS.maxZ);
    }
  });

  it("writes a report a human can act on", () => {
    const report = validateScene({ tables, seatPlan });
    const text = formatReport(report);
    expect(text).toContain("tables=20");
    expect(text).toContain("ok");
  });
});

describe("full audit with real navigation", () => {
  it("reaches every table from the entrance through the nav grid", () => {
    const audit = auditFloor();
    const unreachable = audit.findings.filter((finding) => finding.rule === "circulation.reach");
    expect(unreachable.map((finding) => finding.subject)).toEqual([]);
    expect(audit.ok).toBe(true);
  });

  it("keeps the audit clean for the canonical plan end to end", () => {
    const audit = auditFloor();
    expect(audit.counts.critical + audit.counts.high + audit.counts.medium).toBe(0);
    expect(audit.text.split("\n")[0]).toBe("tables=20 critical=0 high=0 medium=0 low=0 ok");
  });
});

describe("rules fire when they should", () => {
  it("flags a table pushed through the wall as critical", () => {
    const pushed = tables.map((table) => (table.code === "T01" ? { ...table, x: -12.6 } : table));
    const report = validateScene({ tables: pushed, seatPlan });
    expect(codes(report, "bounds.table")).toContain("T01");
    expect(report.findings.find((finding) => finding.rule === "bounds.table")?.severity).toBe("critical");
    expect(report.ok).toBe(false);
  });

  it("flags two tables placed on top of each other", () => {
    const overlapping = tables.map((table) => (table.code === "T02" ? { ...table, x: -9.4, z: -5.6 } : table));
    const report = validateScene({ tables: overlapping, seatPlan });
    expect(codes(report, "table.overlap").concat(codes(report, "spacing.tight")).length).toBeGreaterThan(0);
    expect(report.ok).toBe(false);
  });

  it("flags a chair pushed into a fixture", () => {
    // Park a table so close to the bar that its chair must enter the counter.
    const cramped = tables.map((table) =>
      table.code === "T13" ? { ...table, x: 4.0, z: -4.05 } : table,
    );
    const report = validateScene({ tables: cramped, seatPlan });
    expect(codes(report, "fixture.chair").concat(codes(report, "fixture.overlap")).length).toBeGreaterThan(0);
  });

  it("flags furniture that blocks an opening", () => {
    const blocked = tables.map((table) => (table.code === "T06" ? { ...table, x: -4.0, z: 1.6 } : table));
    const report = validateScene({ tables: blocked, seatPlan });
    const blocking = codes(report, "opening.blocked");
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.join(",")).toContain("terrace-door");
  });

  it("reports circulation unreachability when the probe says no", () => {
    const report = validateScene({ tables, seatPlan, canReach: () => false });
    expect(codes(report, "circulation.reach").length).toBe(tables.length);
    const reach = report.findings.find((finding) => finding.rule === "circulation.reach");
    expect(reach?.severity).toBe("high");
    expect(reach?.suggestion).toBeTruthy();
  });

  it("does not report unreachable tables when the probe says yes", () => {
    const report = validateScene({ tables, seatPlan, canReach: () => true });
    expect(codes(report, "circulation.reach")).toHaveLength(0);
  });

  it("keeps every opening in the plan within the shell", () => {
    for (const opening of OPENINGS) {
      expect(opening.from, opening.id).toBeLessThan(opening.to);
      expect(opening.head, opening.id).toBeLessThanOrEqual(3.35);
      expect(opening.clearance, opening.id).toBeGreaterThan(0.8);
    }
  });
});
