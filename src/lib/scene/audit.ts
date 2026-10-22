/**
 * One-call spatial audit of the canonical room.
 *
 * This is the seam every consumer uses:
 *  - tests assert it is clean;
 *  - `?debug3d=1` prints it to the console and exposes it on `window`;
 *  - any future editor can run it before saving a plan.
 *
 * It is pure (no three.js, no database), so it runs identically in Node, jsdom
 * and the browser.
 */

import { LANDMARKS, TABLES, type TableLike } from "./layout";
import { computeSeatPlan } from "./placement";
import { formatReport, validateScene, type ValidationReport } from "./validate";
import { NavGrid } from "@/lib/simulation/path";

export interface FloorAudit extends ValidationReport {
  /** Human-readable report, ready for a console or a CI log. */
  text: string;
}

export function auditFloor(tables: TableLike[] = TABLES): FloorAudit {
  const seatPlan = computeSeatPlan(tables);
  const nav = new NavGrid(tables);
  const report = validateScene({
    tables,
    seatPlan,
    canReach: (point) => nav.canReach(LANDMARKS.door, point),
  });
  return { ...report, text: formatReport(report) };
}
