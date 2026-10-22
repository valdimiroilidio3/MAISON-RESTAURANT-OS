/**
 * Spatial validation layer.
 *
 * Pure geometry rules over the canonical layout (no three.js, no DOM), so the
 * same checks run in tests, in the build and — via `?debug3d=1` — in the
 * browser. Findings carry an id, a severity, a position, whether the violation
 * is certain ("confirmed") or needs a human look, and a suggested correction.
 *
 * Severity
 *  CRITICAL — the environment is spatially wrong or unusable (a chair inside a
 *             wall, a blocked door, a table outside the floor).
 *  HIGH     — intersections and tight service that a guest would notice.
 *  MEDIUM   — crowding, alignment, ambiguous placement.
 *  LOW      — presentation polish.
 */

import { tableDimensions } from "@/lib/floor-geometry";
import {
  FIXTURES,
  OPENINGS,
  ROOM_BOUNDS,
  openingClearance,
  wallFootprints,
  type Fixture,
  type Opening,
  type TableLike,
} from "./layout";
import { CHAIR_RADIUS, approachPoints, computeSeatPlan, plannedSeats, type SeatPlan } from "./placement";
import {
  circleInsideRect,
  circleRectOverlap,
  distance,
  obbBounds,
  obbCircleGap,
  obbFromRect,
  obbGap,
  rectContainsRect,
  rectsOverlap,
  type Circle,
  type Obb,
  type Rect,
} from "./spatial";

export type Severity = "critical" | "high" | "medium" | "low";

export interface Finding {
  rule: string;
  severity: Severity;
  /** Object the finding is about (table code, fixture id, opening id). */
  subject: string;
  message: string;
  position?: { x: number; z: number };
  suggestion?: string;
  /** false = needs visual review or is a soft preference. */
  confirmed: boolean;
}

export interface ValidationReport {
  findings: Finding[];
  counts: Record<Severity, number>;
  ok: boolean;
  tables: number;
  /** Solved seat rotations used by the checks. */
  seatPlan: SeatPlan;
}

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

function tableObb(table: TableLike): Obb {
  const round = table.shape === "round";
  // width/depth come from the same helper the renderer uses
  const dims = tableDimensions(table);
  return {
    x: table.x,
    z: table.z,
    hw: (round ? dims.radius : dims.width / 2),
    hd: (round ? dims.radius : dims.depth / 2),
    rotation: table.rotation,
  };
}

export interface ValidateOptions {
  tables: TableLike[];
  fixtures?: Fixture[];
  openings?: Opening[];
  bounds?: Rect;
  /** Seat rotations; computed when omitted. */
  seatPlan?: SeatPlan;
  /** Reachability probe (e.g. the navigation grid). Returns true when a body of
   *  the given radius can walk from the entrance to `point`. */
  canReach?: (point: { x: number; z: number }, radius: number) => boolean;
  /** Minimum clear gap between two table groups before it is reported. */
  tightSpacing?: number;
}

export function validateScene(options: ValidateOptions): ValidationReport {
  const tables = options.tables;
  const fixtures = options.fixtures ?? FIXTURES;
  const openings = options.openings ?? OPENINGS;
  const bounds = options.bounds ?? ROOM_BOUNDS;
  const tightSpacing = options.tightSpacing ?? 0.18;
  const seatPlan = options.seatPlan ?? computeSeatPlan(tables, fixtures, bounds);
  const walls = wallFootprints();
  const findings: Finding[] = [];

  const seatsOf = (table: TableLike): Circle[] =>
    plannedSeats(table, seatPlan).map((slot) => ({ x: slot.x, z: slot.z, r: CHAIR_RADIUS }));

  /* ------------------------------------------------- shells and containment */
  for (const table of tables) {
    const obb = tableObb(table);
    const corners = obbBounds(obb);
    if (!rectContainsRect(bounds, corners, 0.02)) {
      findings.push({
        rule: "bounds.table",
        severity: "critical",
        subject: table.code,
        message: `A mesa ${table.code} sai dos limites do piso.`,
        position: { x: table.x, z: table.z },
        suggestion: "Reposicionar a mesa dentro de ROOM_BOUNDS (ou alargar o piso).",
        confirmed: true,
      });
    }
    for (const [index, seat] of seatsOf(table).entries()) {
      if (!circleInsideRect(seat, bounds)) {
        findings.push({
          rule: "bounds.chair",
          severity: "critical",
          subject: `${table.code}#${index + 1}`,
          message: `A cadeira ${index + 1} de ${table.code} está fora do piso.`,
          position: { x: seat.x, z: seat.z },
          suggestion: "Rodar o lugar ou afastar a mesa da fachada/limite.",
          confirmed: true,
        });
      }
      for (const wall of walls) {
        if (circleRectOverlap(seat, wall.rect)) {
          findings.push({
            rule: "partition.chair",
            severity: "critical",
            subject: `${table.code}#${index + 1}`,
            message: `A cadeira ${index + 1} de ${table.code} atravessa a parede ${wall.id}.`,
            position: { x: seat.x, z: seat.z },
            suggestion: "Rodar a mesa (seatPlan) ou afastá-la da parede.",
            confirmed: true,
          });
        }
      }
    }
  }

  /* ----------------------------------------------------------------- tables */
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const a = tables[i];
      const b = tables[j];
      const gap = obbGap(tableObb(a), tableObb(b));
      if (gap < 0) {
        findings.push({
          rule: "table.overlap",
          severity: "critical",
          subject: `${a.code}/${b.code}`,
          message: `Os tampos de ${a.code} e ${b.code} interpenetram-se (${(-gap).toFixed(2)} m).`,
          position: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
          suggestion: "Rever as coordenadas na base de dados (pos_x/pos_z).",
          confirmed: true,
        });
      }
      let seatGap = Infinity;
      const seatA = seatsOf(a);
      const seatB = seatsOf(b);
      const obbA = tableObb(a);
      const obbB = tableObb(b);
      for (const seat of seatA) {
        seatGap = Math.min(seatGap, obbCircleGap(obbB, seat));
        for (const other of seatB) seatGap = Math.min(seatGap, distance(seat, other) - seat.r - other.r);
      }
      for (const seat of seatB) seatGap = Math.min(seatGap, obbCircleGap(obbA, seat));
      if (seatGap < 0) {
        findings.push({
          rule: "chair.overlap",
          severity: "high",
          subject: `${a.code}/${b.code}`,
          message: `As cadeiras de ${a.code} e ${b.code} interpenetram-se (${(-seatGap).toFixed(2)} m).`,
          position: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
          suggestion: "Afastar as mesas ou rodar os lugares (seatPlan).",
          confirmed: true,
        });
      } else if (seatGap < tightSpacing) {
        findings.push({
          rule: "spacing.tight",
          severity: "medium",
          subject: `${a.code}/${b.code}`,
          message: `${a.code} e ${b.code} têm só ${seatGap.toFixed(2)} m entre cadeira e mesa/cadeira vizinha.`,
          position: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
          suggestion: "Dar mais 0,2 m entre grupos para o serviço circular.",
          confirmed: false,
        });
      }
    }
  }

  /* --------------------------------------------------------------- fixtures */
  for (const table of tables) {
    const obb = tableObb(table);
    for (const fixture of fixtures) {
      const fixtureObb = obbFromRect(fixture.footprint);
      const tableGap = obbGap(obb, fixtureObb);
      if (tableGap < 0) {
        findings.push({
          rule: "fixture.overlap",
          severity: "critical",
          subject: `${table.code}/${fixture.id}`,
          message: `A mesa ${table.code} entra em ${fixture.label} (${(-tableGap).toFixed(2)} m).`,
          position: { x: table.x, z: table.z },
          suggestion: "Mover a mesa ou o móvel fixo (FIXTURES).",
          confirmed: true,
        });
      }
      for (const [index, seat] of seatsOf(table).entries()) {
        const gap = obbCircleGap(fixtureObb, seat);
        if (gap < 0) {
          findings.push({
            rule: "fixture.chair",
            severity: "high",
            subject: `${table.code}#${index + 1}/${fixture.id}`,
            message: `A cadeira ${index + 1} de ${table.code} entra em ${fixture.label}.`,
            position: { x: seat.x, z: seat.z },
            suggestion: "Rodar a mesa ou afastá-la do móvel.",
            confirmed: true,
          });
        }
      }
    }
  }

  /* --------------------------------------------------------------- openings */
  for (const opening of openings) {
    const zone = openingClearance(opening);
    for (const fixture of fixtures) {
      // the pass counter *is* the pass — it is expected inside the opening
      if (opening.kind === "pass" && fixture.kind === "pass") continue;
      if (rectsOverlap(zone, fixture.footprint)) {
        findings.push({
          rule: "opening.blocked",
          severity: "critical",
          subject: `${opening.id}/${fixture.id}`,
          message: `${fixture.label} invade a zona de circulação de ${opening.id}.`,
          position: { x: (zone.minX + zone.maxX) / 2, z: (zone.minZ + zone.maxZ) / 2 },
          suggestion: "Afastar o móvel da abertura.",
          confirmed: true,
        });
      }
    }
    for (const table of tables) {
      for (const [index, seat] of seatsOf(table).entries()) {
        if (circleRectOverlap(seat, zone)) {
          findings.push({
            rule: "opening.blocked",
            severity: "critical",
            subject: `${opening.id}/${table.code}#${index + 1}`,
            message: `Uma cadeira de ${table.code} bloqueia ${opening.id}.`,
            position: { x: seat.x, z: seat.z },
            suggestion: "Rodar a mesa ou afastá-la da abertura.",
            confirmed: true,
          });
        }
      }
    }
  }

  /* ----------------------------------------------------------- circulation */
  if (options.canReach) {
    for (const table of tables) {
      // A table is usable when *some* way in exists; probing only one side of
      // the table reports a false blockage whenever that side faces a wall.
      const approaches = approachPoints(table, seatPlan);
      const reachable = approaches.some((point) => options.canReach?.(point, CHAIR_RADIUS));
      if (!reachable) {
        findings.push({
          rule: "circulation.reach",
          severity: "high",
          subject: table.code,
          message: `Não há caminho livre até ${table.code} para um empregado.`,
          position: { x: table.x, z: table.z },
          suggestion: "Alargar o corredor junto à mesa ou rever os móveis fixos.",
          confirmed: true,
        });
      }
    }
  }

  /* ---------------------------------------------------------------- summary */
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return {
    findings: findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
    counts,
    ok: counts.critical === 0 && counts.high === 0,
    tables: tables.length,
    seatPlan,
  };
}

/** Compact human-readable report, used by the test suite and the debug probe. */
export function formatReport(report: ValidationReport): string {
  const header = `tables=${report.tables} critical=${report.counts.critical} high=${report.counts.high} medium=${report.counts.medium} low=${report.counts.low} ${
    report.ok ? "ok" : "blocked"
  }`;
  const lines = report.findings.map((finding) => {
    const where = finding.position ? ` @(${finding.position.x.toFixed(2)}, ${finding.position.z.toFixed(2)})` : "";
    const state = finding.confirmed ? "confirmed" : "needs-review";
    const fix = finding.suggestion ? `\n           fix: ${finding.suggestion}` : "";
    return `${finding.severity.toUpperCase().padEnd(9)} ${finding.rule.padEnd(19)} ${finding.subject.padEnd(14)} ${state}${where}\n           ${finding.message}${fix}`;
  });
  return [header, ...lines].join("\n");
}
