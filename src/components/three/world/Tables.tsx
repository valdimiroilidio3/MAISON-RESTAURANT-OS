"use client";

/**
 * Tables, chairs and place settings.
 *
 * - Seat positions come from `plannedSeats` (solver), never from ad-hoc maths.
 * - All 72 chairs share one merged geometry and render as a single
 *   `InstancedMesh`; tabletops share a geometry cache keyed by dimensions.
 * - Table labels live in `Labels` (distance-aware) so the 3D scene never needs
 *   one DOM node per table.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TABLES, hasParasol, type TableLike } from "@/lib/scene/layout";
import { computeSeatPlan, plannedSeats } from "@/lib/scene/placement";
import { CHAIR_SEAT_HEIGHT, tableDimensions } from "@/lib/floor-geometry";
import { TABLE_STATUS_META } from "@/lib/status";
import { blobTexture, tableLabelTexture } from "../materials";

const OAK = "#5a4128";
/** Chairs read as silhouette at dusk; two tones of oak keep them legible. */
const CHAIR = "#4a3524";
const LINEN = "#e7ded0";
const BRASS = "#b8965d";

export interface TableStatusMap {
  [code: string]: keyof typeof TABLE_STATUS_META;
}

/* --------------------------------------------------------------- geometry */

function box(width: number, height: number, depth: number, x: number, y: number, z: number, rx = 0, rz = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz));
  matrix.setPosition(x, y, z);
  geometry.applyMatrix4(matrix);
  return geometry;
}

/**
 * One chair, built facing the table: local −Z is the front, the backrest sits at
 * +Z. Rotation only ever has to be applied as the instance quaternion.
 */
function chairGeometry(): THREE.BufferGeometry {
  const parts = [
    // seat
    box(0.44, 0.055, 0.42, 0, CHAIR_SEAT_HEIGHT, 0),
    // back frame (slightly reclined)
    box(0.42, 0.46, 0.05, 0, 0.7, 0.195, -0.09, 0),
    // back slat detail
    box(0.34, 0.05, 0.065, 0, 0.84, 0.2, -0.09, 0),
    // legs
    box(0.038, 0.44, 0.038, -0.17, 0.22, -0.16),
    box(0.038, 0.44, 0.038, 0.17, 0.22, -0.16),
    box(0.038, 0.46, 0.038, -0.17, 0.23, 0.16),
    box(0.038, 0.46, 0.038, 0.17, 0.23, 0.16),
    // stretcher
    box(0.36, 0.028, 0.028, 0, 0.16, -0.16),
  ];
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error("chair geometry could not be merged");
  geometry.computeVertexNormals();
  return geometry;
}

/** Shared per-dimension tabletop + pedestal geometries. */
const tableGeometryCache = new Map<string, { top: THREE.BufferGeometry; base: THREE.BufferGeometry; rim: THREE.BufferGeometry }>();

function tableGeometries(table: TableLike) {
  const dims = tableDimensions(table);
  const key = `${table.shape}-${dims.width.toFixed(2)}-${dims.depth.toFixed(2)}`;
  const cached = tableGeometryCache.get(key);
  if (cached) return cached;
  const top =
    table.shape === "round"
      ? new THREE.CylinderGeometry(dims.radius, dims.radius, 0.05, 40)
      : new THREE.BoxGeometry(dims.width, 0.05, dims.depth);
  top.translate(0, dims.height - 0.025, 0);
  const base =
    table.shape === "round"
      ? new THREE.CylinderGeometry(0.07, 0.24, dims.height - 0.05, 20)
      : new THREE.BoxGeometry(dims.width * 0.62, dims.height - 0.05, dims.depth * 0.5);
  base.translate(0, (dims.height - 0.05) / 2, 0);
  const rim =
    table.shape === "round"
      ? new THREE.TorusGeometry(dims.radius - 0.005, 0.012, 6, 44)
      : new THREE.BoxGeometry(dims.width + 0.02, 0.012, dims.depth + 0.02);
  if (table.shape === "round") rim.rotateX(Math.PI / 2);
  rim.translate(0, dims.height - 0.05, 0);
  const entry = { top, base, rim };
  tableGeometryCache.set(key, entry);
  return entry;
}

/* ----------------------------------------------------------------- chairs */

function Chairs({ yaws }: { yaws: Map<number, number> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => chairGeometry(), []);
  const seats = useMemo(
    () => TABLES.flatMap((table) => plannedSeats(table, yaws).map((slot) => ({ ...slot, code: table.code }))),
    [yaws],
  );

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    seats.forEach((seat, index) => {
      position.set(seat.x, 0.0, seat.z);
      quaternion.setFromEuler(new THREE.Euler(0, seat.rotation, 0));
      matrix.compose(position, quaternion, scale);
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [seats]);

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, seats.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <meshStandardMaterial color={CHAIR} roughness={0.55} metalness={0.1} />
    </instancedMesh>
  );
}

/* ---------------------------------------------------------- place settings */

/**
 * Plates and their rims as two instanced meshes. Rendering them per seat cost
 * 144 draw calls on the dining floor alone; instancing costs two.
 */
function PlaceSettings({ yaw }: { yaw: Map<number, number> }) {
  const plates = useRef<THREE.InstancedMesh>(null);
  const rims = useRef<THREE.InstancedMesh>(null);

  const seats = useMemo(() => {
    const points: Array<{ x: number; y: number; z: number }> = [];
    for (const table of TABLES) {
      const dims = tableDimensions(table);
      const cos = Math.cos(table.rotation);
      const sin = Math.sin(table.rotation);
      for (const seat of plannedSeats(table, yaw)) {
        const dx = seat.x - table.x;
        const dz = seat.z - table.z;
        // world → table-local
        let lx = dx * cos - dz * sin;
        let lz = dx * sin + dz * cos;
        if (table.shape === "round") {
          const length = Math.hypot(lx, lz) || 1;
          const target = Math.max(0.12, dims.radius - 0.26);
          lx = (lx / length) * target;
          lz = (lz / length) * target;
        } else {
          const limitX = Math.max(0, dims.width / 2 - 0.3);
          lx = Math.max(-limitX, Math.min(limitX, lx));
          lz = Math.sign(lz || 1) * Math.max(0.1, dims.depth / 2 - 0.22);
        }
        points.push({
          x: table.x + lx * cos + lz * sin,
          y: dims.height + 0.008,
          z: table.z - lx * sin + lz * cos,
        });
      }
    }
    return points;
  }, [yaw]);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    seats.forEach((seat, index) => {
      matrix.compose(new THREE.Vector3(seat.x, seat.y, seat.z), quaternion, scale);
      plates.current?.setMatrixAt(index, matrix);
      matrix.compose(new THREE.Vector3(seat.x, seat.y + 0.009, seat.z), quaternion, scale);
      rims.current?.setMatrixAt(index, matrix);
    });
    if (plates.current) {
      plates.current.instanceMatrix.needsUpdate = true;
      plates.current.computeBoundingSphere();
    }
    if (rims.current) rims.current.instanceMatrix.needsUpdate = true;
  }, [seats]);

  return (
    <group name="place-settings">
      <instancedMesh ref={plates} args={[undefined, undefined, seats.length]} frustumCulled={false} castShadow={false}>
        <cylinderGeometry args={[0.105, 0.105, 0.012, 18]} />
        <meshStandardMaterial color="#f4efe6" roughness={0.26} metalness={0.04} />
      </instancedMesh>
      <instancedMesh ref={rims} args={[undefined, undefined, seats.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.062, 0.062, 0.004, 16]} />
        <meshStandardMaterial color="#ded5c5" roughness={0.32} />
      </instancedMesh>
    </group>
  );
}

/* ----------------------------------------------------------------- tables */

function ContactShadow({ table }: { table: TableLike }) {
  const texture = blobTexture();
  const dims = tableDimensions(table);
  const radius = table.shape === "round" ? dims.radius + 0.75 : Math.max(dims.width, dims.depth) / 2 + 0.9;
  return (
    <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <meshBasicMaterial map={texture} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * Tables, instanced by *dimension group*.
 *
 * Twenty tables share only five distinct top/pedestal geometries (round 1.24,
 * round 1.64, rect 1.35 / 2.00 / 2.70), so five instanced meshes replace twenty
 * per-table groups — ~115 meshes become ~26. The variation that actually exists
 * between tables (cloth vs bare oak) is carried by per-instance colour, and the
 * variation that is unique (the table number) stays a texture.
 */
interface TableGroup {
  key: string;
  geometry: { top: THREE.BufferGeometry; base: THREE.BufferGeometry; rim: THREE.BufferGeometry };
  tables: TableLike[];
  height: number;
}

function groupTables(): TableGroup[] {
  const groups = new Map<string, TableGroup>();
  for (const table of TABLES) {
    const dims = tableDimensions(table);
    const key = `${table.shape}-${dims.width.toFixed(2)}-${dims.depth.toFixed(2)}`;
    const existing = groups.get(key);
    if (existing) existing.tables.push(table);
    else groups.set(key, { key, geometry: tableGeometries(table), tables: [table], height: dims.height });
  }
  return [...groups.values()];
}

const CLOTH = "#e6dccb";

function InstancedTables({ groups }: { groups: TableGroup[] }) {
  const tops = useRef<Array<THREE.InstancedMesh | null>>([]);
  const bases = useRef<Array<THREE.InstancedMesh | null>>([]);
  const rims = useRef<Array<THREE.InstancedMesh | null>>([]);
  const cloths = useRef<Array<THREE.InstancedMesh | null>>([]);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const colour = new THREE.Color();

    groups.forEach((group, groupIndex) => {
      const clothOnly = group.tables.filter((table) => !hasParasol(table));
      group.tables.forEach((table, index) => {
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), table.rotation ?? 0);
        position.set(table.x, 0, table.z);
        matrix.compose(position, quaternion, one);
        tops.current[groupIndex]?.setMatrixAt(index, matrix);
        tops.current[groupIndex]?.setColorAt(index, colour.set(hasParasol(table) ? OAK : CLOTH));
        bases.current[groupIndex]?.setMatrixAt(index, matrix);
        rims.current[groupIndex]?.setMatrixAt(index, matrix);
      });
      clothOnly.forEach((table, index) => {
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), table.rotation ?? 0);
        position.set(table.x, -0.026, table.z);
        matrix.compose(position, quaternion, new THREE.Vector3(1.015, 0.9, 1.015));
        cloths.current[groupIndex]?.setMatrixAt(index, matrix);
      });
      const top = tops.current[groupIndex];
      if (top) {
        top.instanceMatrix.needsUpdate = true;
        if (top.instanceColor) top.instanceColor.needsUpdate = true;
        top.computeBoundingSphere();
      }
      for (const mesh of [bases.current[groupIndex], rims.current[groupIndex], cloths.current[groupIndex]]) {
        if (!mesh) continue;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    });
  }, [groups]);

  return (
    <>
      {groups.map((group, index) => (
        <group key={group.key} name={`tabletop-set-${group.key}`}>
          <instancedMesh
            ref={(node) => {
              tops.current[index] = node;
            }}
            args={[group.geometry.top, undefined, group.tables.length]}
            castShadow
            receiveShadow
            frustumCulled={false}
          >
            <meshStandardMaterial roughness={0.55} metalness={0.06} />
          </instancedMesh>
          <instancedMesh
            ref={(node) => {
              cloths.current[index] = node;
            }}
            args={[group.geometry.top, undefined, group.tables.filter((table) => !hasParasol(table)).length]}
            castShadow
            frustumCulled={false}
            visible={group.tables.some((table) => !hasParasol(table))}
          >
            <meshStandardMaterial color={LINEN} roughness={0.85} />
          </instancedMesh>
          <instancedMesh
            ref={(node) => {
              bases.current[index] = node;
            }}
            args={[group.geometry.base, undefined, group.tables.length]}
            castShadow
            frustumCulled={false}
          >
            <meshStandardMaterial color="#2f2318" roughness={0.55} metalness={0.15} />
          </instancedMesh>
          <instancedMesh
            ref={(node) => {
              rims.current[index] = node;
            }}
            args={[group.geometry.rim, undefined, group.tables.length]}
            frustumCulled={false}
          >
            <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.9} />
          </instancedMesh>
        </group>
      ))}
    </>
  );
}

/** Table numbers and status rings: the parts that are genuinely per-table. */
function TableDetails({ statuses }: { statuses?: TableStatusMap }) {
  return (
    <group name="marks">
      {TABLES.map((table) => {
        const dims = tableDimensions(table);
        const status = statuses?.[table.code];
        const meta = status ? TABLE_STATUS_META[status] : undefined;
        const cloth = !hasParasol(table);
        return (
          <group key={table.code} name={`table-${table.code}`} position={[table.x, 0, table.z]} rotation={[0, table.rotation, 0]}>
            {/* table number, baked into a tiny texture: readable from the camera
                without a single DOM node */}
            <mesh position={[0, dims.height + 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.19, 0.095]} />
              <meshBasicMaterial map={tableLabelTexture(table.code, { tone: cloth ? "light" : "dark" })} toneMapped={false} />
            </mesh>
            {meta && status !== "available" && (
              <mesh position={[0, dims.height + 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry
                  args={[
                    table.shape === "round" ? dims.radius + 0.03 : dims.width / 2 - 0.02,
                    table.shape === "round" ? dims.radius + 0.055 : dims.width / 2 + 0.02,
                    44,
                  ]}
                />
                <meshBasicMaterial color={meta.dot} transparent opacity={0.5} toneMapped={false} />
              </mesh>
            )}
            <ContactShadow table={table} />
          </group>
        );
      })}
    </group>
  );
}

export function Tables({ statuses, yaw }: { statuses?: TableStatusMap; yaw?: Map<number, number> }) {
  const yaws = useMemo(() => yaw ?? computeSeatPlan(TABLES), [yaw]);
  const groups = useMemo(() => groupTables(), []);
  return (
    <group name="tables">
      <InstancedTables groups={groups} />
      <TableDetails statuses={statuses} />
      <Chairs yaws={yaws} />
      <PlaceSettings yaw={yaws} />
    </group>
  );
}
