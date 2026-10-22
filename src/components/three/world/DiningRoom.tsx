"use client";

/**
 * The assembled dining room used by the public site and the operations floor.
 *
 * It is a *composition*, not an implementation: shell, fixtures, tables and
 * light all come from their own modules, and the only thing this file owns is
 * the interaction contract with the rest of the app (select / hover / dim).
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { TABLES, ZONE_BOUNDS, type TableLike } from "@/lib/scene/layout";
import { computeSeatPlan } from "@/lib/scene/placement";
import { auditFloor } from "@/lib/scene/audit";
import { debugEnabled } from "./CameraRig";
import { tableDimensions } from "@/lib/floor-geometry";
import type { SceneTable, SceneZone } from "../room-types";
import { Shell } from "./Shell";
import { Fixtures } from "./Fixtures";
import { Tables } from "./Tables";
import { SkyDome, CityBackdrop } from "./Environment";
import { Lighting, type LightingQuality } from "./lighting";

export interface RoomQuality extends LightingQuality {
  guests: boolean;
  candles: boolean;
  labels: boolean;
}

export interface DiningRoomProps {
  tables: SceneTable[];
  zones: SceneZone[];
  mode: "preview" | "operations";
  selectedId: number | null;
  hoveredId?: number | null;
  dimZone: string | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  quality: RoomQuality;
  reducedMotion: boolean;
  /** 0 = night, 1 = midday. */
  daylight?: number;
}

/** Hit area around a table: the tabletop plus the chair ring. */
function hitRadius(table: TableLike): number {
  const dims = tableDimensions(table);
  if (table.shape === "round") return dims.radius + 0.6;
  return Math.max(dims.width, dims.depth) / 2 + 0.65;
}

/**
 * The interactive layer. Geometry lives in `Tables`; this only adds an invisible
 * footprint to click, a dim veil for filtered zones and the selection ring.
 * Keeping the two apart means a table can never be clicked in a place where it
 * is not drawn.
 */
function TableInteraction({
  table,
  selected,
  dimmed,
  onSelect,
  onHover,
}: {
  table: TableLike;
  selected: boolean;
  dimmed: boolean;
  onSelect?: (id: number) => void;
  onHover?: (id: number | null) => void;
}) {
  const dims = tableDimensions(table);
  const radius = hitRadius(table);
  return (
    <group position={[table.x, 0, table.z]}>
      {onSelect && (
        <mesh
          position={[0, 0.5, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(table.id);
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            onHover?.(table.id);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            onHover?.(null);
            document.body.style.cursor = "";
          }}
        >
          <cylinderGeometry args={[radius, radius, 1.4, 18]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      )}
      {dimmed && (
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[radius, 32]} />
          <meshBasicMaterial color="#0A0908" transparent opacity={0.5} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius - 0.06, radius, 64]} />
          <meshBasicMaterial color="#C6A66B" transparent opacity={0.95} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, dims.height + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[dims.width / 2 + 0.02, dims.width / 2 + 0.06, 48]} />
          <meshBasicMaterial color="#C6A66B" transparent opacity={0.7} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export function DiningRoom({
  tables,
  zones,
  mode,
  selectedId,
  hoveredId = null,
  dimZone,
  onSelect,
  onHover,
  quality,
  reducedMotion,
  daylight = 1,
}: DiningRoomProps) {
  void zones;
  void reducedMotion;

  const yaw = useMemo(() => computeSeatPlan(TABLES), []);

  // `?debug3d=1` publishes the same audit the tests run, against the room that
  // is actually on screen. It never renders anything: validation must not be
  // able to change the scene it is validating.
  useEffect(() => {
    if (!debugEnabled()) return;
    const report = auditFloor();
    (window as unknown as { __MAISON_SPATIAL__?: unknown }).__MAISON_SPATIAL__ = {
      ok: report.ok,
      counts: report.counts,
      findings: report.findings,
    };
    // eslint-disable-next-line no-console
    console.info(`[MAISON spatial audit]\n${report.text}`);
  }, []);
  const byCode = useMemo(() => new Map(tables.map((table) => [table.code, table])), [tables]);
  const statuses = useMemo(
    () => Object.fromEntries(tables.map((table) => [table.code, table.status])),
    [tables],
  );

  return (
    <group name="maison-dining-room">
      <SkyDome light={{ current: { dayLight: daylight } }} />
      <CityBackdrop />
      <Lighting daylight={daylight} quality={quality} />
      <Shell />
      <Fixtures />
      <Tables statuses={statuses as never} yaw={yaw} />
      {TABLES.map((table) => {
        const db = byCode.get(table.code);
        const planTable = { ...table, id: db?.id ?? table.id };
        return (
          <TableInteraction
            key={table.code}
            table={planTable}
            selected={!!db && db.id === selectedId}
            dimmed={!!dimZone && db?.zoneSlug !== dimZone}
            // Selection is a presentation feature on the public floor too: the
            // guest clicks a table to see it and reserve it. What the preview
            // never receives is status data, and that is a data decision, not a
            // rendering one.
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </group>
  );
}
