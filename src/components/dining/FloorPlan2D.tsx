"use client";

import { useMemo } from "react";
import { TABLE_STATUS_META } from "@/lib/status";
import { cn } from "@/lib/cn";
import type { TableStatus } from "@/lib/types";
import type { SceneTable } from "@/components/three/room-types";
import {
  FIXTURES,
  INTERIOR,
  KITCHEN,
  OPENINGS,
  PARTITIONS,
  POTS,
  ROOM_BOUNDS,
  TERRACE,
  ZONE_BOUNDS,
  type Opening,
  type WallRun,
} from "@/lib/scene/layout";
import { tableDimensions } from "@/lib/floor-geometry";
import { circleBox, labelAnchor } from "@/lib/scene/labels";

/**
 * Accessible 2D floor plan.
 *
 * This is not a drawing of the restaurant; it is a **projection of the same
 * canonical model the 3D scene renders** — the same `ROOM_BOUNDS`, the same
 * `PARTITIONS` with their `OPENINGS`, the same `FIXTURES`, the same kitchen wing
 * and the same `tableDimensions()` footprint. A guest without WebGL, a keyboard
 * user and the ops team on a phone all get the room the 3D shows, not a second
 * opinion about it.
 *
 * If a table's drawn square and its 3D top disagreed, the plan would be lying
 * about how much floor that table takes — which is exactly what it used to do.
 */

/**
 * The margin is derived from the widest door swing, not guessed: an opening
 * drawn as a swing arc must fit inside the frame, or the entrance gets clipped.
 */
/**
 * Status must not be conveyed by colour alone (WCAG 1.4.1, and the ops team
 * works on screens with bad colour rendering). Each state also gets a distinct
 * dash signature on its ring, so it survives greyscale and colour blindness.
 */
const STATUS_DASH: Record<TableStatus, string | undefined> = {
  available: undefined,
  reserved: "0.30 0.15",
  occupied: undefined,
  order_pending: "0.10 0.09",
  awaiting_payment: "0.34 0.09 0.09 0.09",
  cleaning: "0.05 0.15",
};

const PAD =
  OPENINGS.reduce((widest, opening) => Math.max(widest, (opening.to - opening.from) / 2), 0) + 0.45;

/** Wall runs cut by the openings that sit in them, as drawable segments. */
function wallSegments(run: WallRun, openings: Opening[]) {
  const cuts = openings
    .filter((opening) => opening.axis === run.axis && Math.abs(opening.at - run.at) < 0.02)
    .sort((a, b) => a.from - b.from);
  const segments: Array<[number, number]> = [];
  let cursor = run.from;
  for (const cut of cuts) {
    if (cut.from > cursor) segments.push([cursor, Math.min(cut.from, run.to)]);
    cursor = Math.max(cursor, cut.to);
  }
  if (cursor < run.to) segments.push([cursor, run.to]);
  return segments.filter(([from, to]) => to - from > 0.01);
}

function Wall({ run }: { run: WallRun }) {
  const segments = wallSegments(run, OPENINGS);
  // Glazing and masonry must not read the same at plan scale: glass is a cool
  // thin double line, masonry a warm thick one.
  const stroke = run.material === "glass" ? "#7fa3ad" : "#5a4d3c";
  const width = run.material === "glass" ? 0.055 : 0.16;
  return (
    <g>
      {segments.map(([from, to], index) => (
        <g key={index} opacity={run.material === "glass" ? 0.75 : 1}>
          <line
            x1={run.axis === "z" ? run.at : from}
            y1={run.axis === "z" ? from : run.at}
            x2={run.axis === "z" ? run.at : to}
            y2={run.axis === "z" ? to : run.at}
            stroke={stroke}
            strokeWidth={width}
            strokeLinecap="butt"
          />
          {run.material === "glass" && (
            <line
              x1={run.axis === "z" ? run.at + 0.14 : from}
              y1={run.axis === "z" ? from : run.at + 0.14}
              x2={run.axis === "z" ? run.at + 0.14 : to}
              y2={run.axis === "z" ? to : run.at + 0.14}
              stroke={stroke}
              strokeWidth={0.022}
              strokeLinecap="butt"
              opacity={0.55}
            />
          )}
        </g>
      ))}
    </g>
  );
}

/** A door/counter opening, drawn as the thing you walk through. */
function OpeningMark({ opening }: { opening: Opening }) {
  const mid = (opening.from + opening.to) / 2;
  const span = opening.to - opening.from;
  if (opening.kind === "pass") {
    return (
      <line
        x1={opening.axis === "z" ? opening.at : opening.from}
        y1={opening.axis === "z" ? opening.from : opening.at}
        x2={opening.axis === "z" ? opening.at : opening.to}
        y2={opening.axis === "z" ? opening.to : opening.at}
        stroke="#C6A66B"
        strokeWidth={0.22}
        strokeDasharray="0.3 0.16"
        opacity={0.75}
      />
    );
  }
  const x = opening.axis === "z" ? opening.at : mid;
  const y = opening.axis === "z" ? mid : opening.at;
  // a door leaf swinging into the room it serves
  const inward = opening.side === "positive" ? 1 : -1;
  return (
    <g>
      {opening.kind === "entrance" && (
        <circle cx={x} cy={y} r={span / 2} fill="none" stroke="#C6A66B" strokeWidth={0.05} opacity={0.35} />
      )}
      <line
        x1={x}
        y1={y}
        x2={opening.axis === "z" ? x + span * inward : x}
        y2={opening.axis === "z" ? y : y + span * inward}
        stroke="#C6A66B"
        strokeWidth={0.05}
        opacity={0.6}
      />
      <circle cx={x} cy={y} r={0.07} fill="#C6A66B" opacity={0.8} />
    </g>
  );
}

export function FloorPlan2D({
  tables,
  selectedId,
  onSelect,
  dimZone,
  mode,
  className,
}: {
  tables: SceneTable[];
  selectedId: number | null;
  onSelect?: (id: number) => void;
  dimZone: string | null;
  mode: "preview" | "operations";
  className?: string;
}) {
  // The viewBox is the canonical shell plus a margin — never a constant that
  // happens to fit today's tables.
  const { minX, minZ, width, height } = useMemo(
    () => ({
      minX: ROOM_BOUNDS.minX - PAD,
      minZ: KITCHEN.minZ - PAD,
      width: ROOM_BOUNDS.maxX - ROOM_BOUNDS.minX + PAD * 2,
      height: ROOM_BOUNDS.maxZ - KITCHEN.minZ + PAD * 2,
    }),
    [],
  );

  const statusOf = (table: SceneTable): TableStatus => table.status ?? "available";

  // Captions get a clear patch of floor: every table, fixture and pot is an
  // obstacle, and the chosen point is the one with the most room around it.
  const terraceLabel = useMemo(
    () =>
      labelAnchor(
        TERRACE,
        [
          ...FIXTURES.map((fixture) => fixture.footprint),
          ...POTS.map((pot) => circleBox(pot.x, pot.z, pot.r)),
          ...tables.map((table) => circleBox(table.x, table.z, Math.max(tableDimensions(table).width, tableDimensions(table).depth) / 2)),
        ],
        {
          padding: 0.5,
          // "ESPLANADA" at 0.30 m with this tracking is ~1.9 m wide.
          self: { width: 1.95, height: 0.45 },
        },
      ),
    [tables],
  );

  const zoneFill: Record<string, string> = {
    esplanada: "#151a16",
    sala: "#191512",
    balcao: "#1a1611",
  };

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line bg-[#0d0b09]", className)}>
      <svg
        viewBox={`${minX} ${minZ} ${width} ${height}`}
        className="h-full w-full"
        role="group"
        aria-label="Planta 2D do salão"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="plan-grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#221e19" strokeWidth="0.015" />
          </pattern>
          <pattern id="plan-terrace" width="0.9" height="0.9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.9" stroke="#242b24" strokeWidth="0.06" />
          </pattern>
        </defs>

        {/* ground */}
        <rect x={minX} y={minZ} width={width} height={height} fill="#0d0b09" />
        <rect x={minX} y={minZ} width={width} height={height} fill="url(#plan-grid)" opacity={0.55} />

        {/* zones */}
        <rect x={TERRACE.minX} y={TERRACE.minZ} width={TERRACE.maxX - TERRACE.minX} height={TERRACE.maxZ - TERRACE.minZ} fill="url(#plan-terrace)" opacity={0.5} />
        <rect x={INTERIOR.minX} y={INTERIOR.minZ} width={INTERIOR.maxX - INTERIOR.minX} height={INTERIOR.maxZ - INTERIOR.minZ} fill={zoneFill.sala} opacity={0.55} />
        <rect x={ZONE_BOUNDS.balcao.minX} y={ZONE_BOUNDS.balcao.minZ} width={ZONE_BOUNDS.balcao.maxX - ZONE_BOUNDS.balcao.minX} height={ZONE_BOUNDS.balcao.maxZ - ZONE_BOUNDS.balcao.minZ} fill={zoneFill.balcao} opacity={0.5} />

        {/* kitchen wing (behind the pass) */}
        <rect
          x={KITCHEN.minX}
          y={KITCHEN.minZ}
          width={KITCHEN.maxX - KITCHEN.minX}
          height={KITCHEN.maxZ - KITCHEN.minZ}
          fill="#12171a"
          stroke="#2a3438"
          strokeWidth={0.06}
        />
        <text
          x={(KITCHEN.minX + KITCHEN.maxX) / 2}
          y={(KITCHEN.minZ + KITCHEN.maxZ) / 2 + 0.1}
          textAnchor="middle"
          fill="#5f6f75"
          fontSize={0.3}
          letterSpacing={0.1}
          style={{ pointerEvents: "none" }}
        >
          COZINHA
        </text>

        {/* fixed furniture, from the same array the 3D builds */}
        {FIXTURES.map((fixture) => {
          const { minX: fx, minZ: fz, maxX: tx, maxZ: tz } = fixture.footprint;
          return (
            <g key={fixture.id}>
              <rect
                x={fx}
                y={fz}
                width={tx - fx}
                height={tz - fz}
                rx={0.08}
                fill={fixture.kind === "counter" ? "#2a2118" : fixture.kind === "pass" ? "#261f16" : "#1d241d"}
                stroke={fixture.kind === "planter" ? "#33422f" : "#453a2a"}
                strokeWidth={0.045}
              />
              {fixture.kind !== "planter" && tx - fx >= 1.6 && (
                <text
                  x={(fx + tx) / 2}
                  y={(fz + tz) / 2 + 0.09}
                  textAnchor="middle"
                  fill="#8d8577"
                  fontSize={0.2}
                  letterSpacing={0.06}
                  style={{ pointerEvents: "none" }}
                >
                  {fixture.label.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}

        {POTS.map((pot) => (
          <circle key={pot.id} cx={pot.x} cy={pot.z} r={pot.r} fill="#2b3626" stroke="#3b4a34" strokeWidth={0.04} />
        ))}

        {/* walls, with their openings cut out */}
        {PARTITIONS.map((run) => (
          <Wall key={run.id} run={run} />
        ))}
        {OPENINGS.map((opening) => (
          <OpeningMark key={opening.id} opening={opening} />
        ))}

        {/* zone labels */}
        <text
          x={terraceLabel.x}
          y={terraceLabel.z}
          textAnchor="middle"
          fill="#6b7767"
          fontSize={0.3}
          letterSpacing={0.16}
          style={{ pointerEvents: "none" }}
        >
          ESPLANADA
        </text>

        {/* tables: footprint from tableDimensions(), i.e. the 3D footprint */}
        {tables.map((table) => {
          const status = statusOf(table);
          const meta = TABLE_STATUS_META[status];
          const dimmed = !!dimZone && table.zoneSlug !== dimZone;
          const selected = selectedId === table.id;
          const dims = tableDimensions(table);
          const halfW = dims.width / 2;
          const halfD = dims.depth / 2;
          const ring = Math.max(halfW, halfD) + 0.42;
          const preview = mode === "preview";
          const statusDash = STATUS_DASH[status];

          // Dimming must not destroy legibility: a de-emphasised table is still
          // a table the operator has to find. Only the *status* recedes; the
          // number stays readable at every zoom.
          const bodyFill = preview ? "#1c1813" : "#221d18";
          const statusStroke = preview ? "#4a4136" : dimmed ? `${meta.dot}55` : meta.dot;
          const labelFill = dimmed ? "#a39c8f" : "#F6F2EA";

          return (
            <g
              key={table.id}
              role="button"
              tabIndex={0}
              aria-label={`Mesa ${table.code}, ${table.seats} lugares, ${meta.label}${table.reservedTime ? `, reserva às ${table.reservedTime}` : ""}`}
              aria-pressed={selected}
              aria-disabled={dimmed || undefined}
              onClick={() => onSelect?.(table.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(table.id);
                }
              }}
              className="cursor-pointer outline-none"
            >
              {selected && (
                <circle cx={table.x} cy={table.z} r={ring + 0.2} fill="none" stroke="#F6F2EA" strokeWidth={0.06} opacity={0.7} />
              )}

              {/* chair ring — neutral, always present, never carries status */}
              <circle cx={table.x} cy={table.z} r={ring} fill="none" stroke="#3a332b" strokeWidth={0.03} strokeDasharray="0.16 0.16" />

              {/* status ring — colour *and* dash signature */}
              {!preview && (
                <circle
                  cx={table.x}
                  cy={table.z}
                  r={Math.max(halfW, halfD) + 0.2}
                  fill="none"
                  stroke={statusStroke}
                  strokeWidth={status === "occupied" ? 0.11 : 0.075}
                  strokeDasharray={statusDash}
                  strokeLinecap="butt"
                  opacity={dimmed ? 0.5 : 1}
                />
              )}

              <rect
                x={table.x - halfW}
                y={table.z - halfD}
                width={halfW * 2}
                height={halfD * 2}
                rx={table.shape === "round" ? halfW : 0.1}
                transform={table.rotation ? `rotate(${(table.rotation * 180) / Math.PI} ${table.x} ${table.z})` : undefined}
                fill={bodyFill}
                stroke={statusStroke}
                strokeWidth={0.05}
                className="transition-opacity hover:opacity-100"
              />
              <text
                x={table.x}
                y={table.z + 0.10}
                textAnchor="middle"
                fill={labelFill}
                fontSize={0.3}
                fontWeight={600}
                letterSpacing={0.02}
                style={{ pointerEvents: "none" }}
              >
                {table.code}
              </text>
              <text
                x={table.x}
                y={table.z + 0.42}
                textAnchor="middle"
                fill={dimmed ? "#6f685d" : "#A39C8F"}
                fontSize={0.21}
                style={{ pointerEvents: "none" }}
              >
                {table.seats}p
              </text>
            </g>
          );
        })}

        {/* scale bar: 5 m, so the plan says what a metre is */}
        <g opacity={0.5} style={{ pointerEvents: "none" }}>
          <line x1={minX + 0.45} y1={ROOM_BOUNDS.maxZ + PAD * 0.55} x2={minX + 5.45} y2={ROOM_BOUNDS.maxZ + PAD * 0.55} stroke="#8d8577" strokeWidth={0.05} />
          <line x1={minX + 0.45} y1={ROOM_BOUNDS.maxZ + PAD * 0.45} x2={minX + 0.45} y2={ROOM_BOUNDS.maxZ + PAD * 0.65} stroke="#8d8577" strokeWidth={0.05} />
          <line x1={minX + 5.45} y1={ROOM_BOUNDS.maxZ + PAD * 0.45} x2={minX + 5.45} y2={ROOM_BOUNDS.maxZ + PAD * 0.65} stroke="#8d8577" strokeWidth={0.05} />
          <text x={minX + 2.95} y={ROOM_BOUNDS.maxZ + PAD * 0.4} textAnchor="middle" fill="#8d8577" fontSize={0.22}>
            5 m
          </text>
        </g>
      </svg>
    </div>
  );
}
