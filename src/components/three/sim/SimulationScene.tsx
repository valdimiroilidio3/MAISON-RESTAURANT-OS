"use client";

/**
 * 3D staging of the live simulation.
 *
 * The room itself is the *same* composition the floor plan uses (`Shell`,
 * `Fixtures`, `Tables`, `SkyDome`), so a chair can never be in one place during
 * service and another in the operations view. What this file adds is the layer
 * that only exists during a service:
 *
 *  - one instanced ring per table, recoloured from the engine's mutable state
 *    inside `useFrame` (no React re-render at 60 fps);
 *  - the cast of stylised actors.
 *
 * Everything that changes per frame is a ref; the component tree only re-renders
 * when the cast changes or the focused table changes.
 */

import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TABLES } from "@/lib/scene/layout";
import { tableDimensions } from "@/lib/floor-geometry";
import type { Simulation, TableVisualState } from "@/lib/simulation/engine";
import { Shell } from "../world/Shell";
import { Fixtures } from "../world/Fixtures";
import { Tables } from "../world/Tables";
import { SkyDome, CityBackdrop } from "../world/Environment";
import { Lighting } from "../world/lighting";
import { Actor } from "./Actor";

const STATUS_COLOR: Record<TableVisualState, string> = {
  free: "#6f6a5f",
  reserved: "#C6A66B",
  seated: "#C6A66B",
  eating: "#62D6A0",
  paying: "#FF625E",
  cleaning: "#9a938a",
};

export interface SceneQuality {
  shadows: boolean;
  lamps: boolean;
}

export interface LightState {
  dayLight: number;
}

/** One instanced ring per table: the status of the room in a single draw call. */
function StatusLayer({ sim, focusedTableId }: { sim: Simulation; focusedTableId: number | null }) {
  const rings = useRef<THREE.InstancedMesh>(null);
  const colors = useRef<string[]>([]);

  const plan = useMemo(
    () =>
      TABLES.map((table) => {
        const dims = tableDimensions(table);
        const rx = table.shape === "round" ? dims.radius + 0.62 : dims.width / 2 + 0.42;
        const rz = table.shape === "round" ? dims.radius + 0.62 : dims.depth / 2 + 0.42;
        return { table, rx, rz };
      }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = rings.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    plan.forEach((entry, index) => {
      matrix.compose(
        new THREE.Vector3(entry.table.x, 0.014, entry.table.z),
        quaternion,
        new THREE.Vector3(entry.rx, entry.rz, 1),
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(STATUS_COLOR.free));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [plan]);

  useFrame(() => {
    const mesh = rings.current;
    if (!mesh) return;
    let dirty = false;
    for (let index = 0; index < plan.length; index++) {
      const state = sim.tables.find((runtime) => runtime.table.code === plan[index].table.code)?.status ?? "free";
      if (colors.current[index] !== state) {
        colors.current[index] = state;
        mesh.setColorAt(index, new THREE.Color(STATUS_COLOR[state]));
        dirty = true;
      }
    }
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const focusIndex = plan.findIndex((entry) => entry.table.id === focusedTableId);

  return (
    <group name="status-layer">
      <instancedMesh ref={rings} args={[undefined, undefined, plan.length]} frustumCulled={false} renderOrder={2}>
        <ringGeometry args={[0.9, 1, 56]} />
        <meshBasicMaterial transparent opacity={0.62} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </instancedMesh>
      {focusIndex >= 0 && (
        <mesh
          position={[plan[focusIndex].table.x, 0.028, plan[focusIndex].table.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[plan[focusIndex].rx, plan[focusIndex].rz, 1]}
        >
          <ringGeometry args={[1.06, 1.1, 64]} />
          <meshBasicMaterial color="#F6F2EA" transparent opacity={0.85} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function ActorsLayer({ sim, reducedMotion }: { sim: Simulation; reducedMotion: boolean }) {
  // Guests who have left (or are in the bathroom) are unmounted so a full day
  // of service never accumulates thousands of meshes in the scene graph.
  const list = sim.actors.filter((actor) => !actor.hidden && !actor.inBathroom);
  return (
    <group name="actors">
      {list.map((actor) => (
        <Actor key={actor.id} actor={actor} dayLight={1} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------- world */

export interface SimulationWorldProps {
  sim: Simulation;
  /** Number of actors currently on the floor; drives re-renders of the cast. */
  castCount: number;
  quality: SceneQuality;
  reducedMotion: boolean;
  focusedTableId: number | null;
  light: React.MutableRefObject<LightState>;
}

function SimulationWorldImpl({
  sim,
  quality,
  reducedMotion,
  focusedTableId,
  light,
}: SimulationWorldProps) {
  return (
    <group name="simulation-world">
      <SkyDome light={light} />
      <CityBackdrop />
      <Lighting daylightRef={light} quality={{ shadows: quality.shadows, practicals: quality.lamps }} />
      <Shell />
      <Fixtures />
      <Tables />
      <StatusLayer sim={sim} focusedTableId={focusedTableId} />
      <ActorsLayer sim={sim} reducedMotion={reducedMotion} />
    </group>
  );
}

export const SimulationWorld = memo(
  SimulationWorldImpl,
  (prev, next) =>
    prev.castCount === next.castCount &&
    prev.quality === next.quality &&
    prev.reducedMotion === next.reducedMotion &&
    prev.focusedTableId === next.focusedTableId &&
    prev.sim === next.sim,
);
