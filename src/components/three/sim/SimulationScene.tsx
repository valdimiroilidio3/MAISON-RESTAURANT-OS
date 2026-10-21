"use client";

/**
 * 3D staging of the live simulation.
 *
 * Everything here reads the engine's mutable runtime objects inside `useFrame`
 * so the room animates at full frame rate without React re-rendering 60×/s.
 * The component tree only re-renders when the *cast* changes (new arrivals).
 */

import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { chairSlots, tableDimensions } from "@/lib/floor-geometry";
import { LANDMARKS, ROOM } from "@/lib/simulation/path";
import type { Simulation, TableVisualState } from "@/lib/simulation/engine";
import { Chandelier, Kitchen, Plant, Planter, WallSconce, BarCounter, BackBar } from "../Furniture";
import { createFloorTexture } from "../materials";
import { Actor } from "./Actor";

const STATUS_COLOR: Record<TableVisualState, string> = {
  free: "#6f6a5f",
  reserved: "#C6A66B",
  seated: "#C6A66B",
  eating: "#62D6A0",
  paying: "#FF625E",
  cleaning: "#9a938a",
};

const STATUS_LABEL: Record<TableVisualState, string> = {
  free: "livre",
  reserved: "reservada",
  seated: "sentados",
  eating: "a comer",
  paying: "a pagar",
  cleaning: "a repor",
};

export interface SceneQuality {
  shadows: boolean;
  lamps: boolean;
}

export interface LightState {
  dayLight: number;
}

/* ------------------------------------------------------------------ shell */

function RoomShell({ quality, light }: { quality: SceneQuality; light: React.MutableRefObject<LightState> }) {
  const stone = useMemo(() => {
    const texture = createFloorTexture("stone");
    texture.repeat.set(7, 9);
    return texture;
  }, []);
  const deck = useMemo(() => {
    const texture = createFloorTexture("wood");
    texture.repeat.set(3.4, 8.4);
    return texture;
  }, []);

  const skyMat = useRef<THREE.MeshBasicMaterial>(null);
  const skyGlow = useRef<THREE.MeshBasicMaterial>(null);
  const westSky = useRef<THREE.MeshBasicMaterial>(null);

  const width = ROOM.maxX - ROOM.minX;
  const depth = ROOM.maxZ - ROOM.minZ;
  const cz = (ROOM.minZ + ROOM.maxZ) / 2;

  useFrame(() => {
    const day = light.current.dayLight;
    const sky = new THREE.Color().setRGB(0.045 + 0.5 * day, 0.065 + 0.58 * day, 0.1 + 0.64 * day);
    for (const material of [skyMat.current, westSky.current]) {
      if (material) material.color.copy(sky);
    }
    if (skyGlow.current) skyGlow.current.opacity = 0.1 + 0.5 * day;
  });

  return (
    <group>
      {/* interior stone floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.4, 0, cz]} receiveShadow>
        <planeGeometry args={[14.4, depth]} />
        <meshStandardMaterial map={stone} color="#8b8375" roughness={0.4} metalness={0.14} />
      </mesh>
      {/* terrace deck */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-8.1, -0.012, cz]} receiveShadow>
        <planeGeometry args={[6.6, depth]} />
        <meshStandardMaterial map={deck} color="#8a7156" roughness={0.72} />
      </mesh>
      <mesh position={[-4.8, 0.008, cz]}>
        <boxGeometry args={[0.18, 0.03, depth]} />
        <meshStandardMaterial color="#17140f" roughness={0.6} />
      </mesh>

      {/* terrace railing (west edge + ends) */}
      <group>
        <mesh position={[-11.35, 1.02, cz]}>
          <boxGeometry args={[0.08, 0.06, depth]} />
          <meshStandardMaterial color="#b9a888" metalness={0.75} roughness={0.32} />
        </mesh>
        <mesh position={[-11.35, 0.3, cz]}>
          <boxGeometry args={[0.05, 0.05, depth]} />
          <meshStandardMaterial color="#8f8067" metalness={0.6} roughness={0.4} />
        </mesh>
        {Array.from({ length: 17 }).map((_, i) => (
          <mesh key={`rail-${i}`} position={[-11.35, 0.52, ROOM.minZ + 0.2 + i * 1.04]}>
            <boxGeometry args={[0.04, 1.0, 0.04]} />
            <meshStandardMaterial color="#6f6353" metalness={0.5} roughness={0.45} />
          </mesh>
        ))}
        {[ROOM.minZ, ROOM.maxZ].map((z) => (
          <mesh key={`rail-end-${z}`} position={[-8.1, 1.02, z]}>
            <boxGeometry args={[6.6, 0.06, 0.08]} />
            <meshStandardMaterial color="#b9a888" metalness={0.75} roughness={0.32} />
          </mesh>
        ))}
      </group>

      {/* divider between dining room and terrace: glass with a wide opening */}
      <group>
        {[
          [ROOM.minZ, 0.6],
          [2.8, ROOM.maxZ],
        ].map(([from, to], index) => (
          <mesh key={`glass-d-${index}`} position={[-4.82, 1.75, (from + to) / 2]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[to - from, 3.4]} />
            <meshStandardMaterial
              color="#8ba0a6"
              transparent
              opacity={0.14}
              roughness={0.04}
              metalness={0.35}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
        {[ROOM.minZ, -5.4, -2.9, -0.3, 0.6, 2.8, 5.1, 7.2, ROOM.maxZ].map((z) => (
          <mesh key={`mullion-${z}`} position={[-4.82, 1.75, z]} castShadow>
            <boxGeometry args={[0.08, 3.5, 0.08]} />
            <meshStandardMaterial color="#15130f" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[-4.82, 3.55, 1.7]}>
          <boxGeometry args={[0.14, 0.18, 2.2]} />
          <meshStandardMaterial color="#15130f" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[-4.82, 3.45, cz]}>
          <boxGeometry args={[0.12, 0.14, depth]} />
          <meshStandardMaterial color="#14110d" roughness={0.8} />
        </mesh>
      </group>

      {/* back wall, split by the kitchen pass, with the WC door on the left */}
      <mesh position={[-3.15, 1.85, ROOM.minZ]} receiveShadow>
        <boxGeometry args={[3.3, 3.7, 0.22]} />
        <meshStandardMaterial color="#26221d" roughness={0.92} />
      </mesh>
      <group position={[-3.9, 0, ROOM.minZ + 0.14]}>
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[0.95, 2.1, 0.06]} />
          <meshStandardMaterial color="#191510" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.05, 0.05]}>
          <boxGeometry args={[0.8, 1.92, 0.02]} />
          <meshStandardMaterial color="#241f19" roughness={0.5} />
        </mesh>
        <mesh position={[0.3, 1.02, 0.09]}>
          <boxGeometry args={[0.16, 0.04, 0.04]} />
          <meshStandardMaterial color="#c9ba97" metalness={0.9} roughness={0.25} />
        </mesh>
        <mesh position={[0, 1.82, 0.075]}>
          <boxGeometry args={[0.3, 0.12, 0.02]} />
          <meshStandardMaterial color="#e9e1cf" roughness={0.6} />
        </mesh>
        <pointLight position={[0, 2.25, 0.5]} color="#ffbf80" intensity={quality.lamps ? 3.4 : 1.4} distance={4} decay={2} />
      </group>
      <mesh position={[6.35, 1.85, ROOM.minZ]} receiveShadow>
        <boxGeometry args={[6.1, 3.7, 0.22]} />
        <meshStandardMaterial color="#26221d" roughness={0.92} />
      </mesh>
      <mesh position={[1.35, 3.15, ROOM.minZ]} receiveShadow>
        <boxGeometry args={[4.9, 1.1, 0.22]} />
        <meshStandardMaterial color="#26221d" roughness={0.92} />
      </mesh>
      {/* pass counter */}
      <mesh position={[1.35, 1.06, ROOM.minZ + 0.24]} castShadow>
        <boxGeometry args={[4.9, 0.08, 0.5]} />
        <meshStandardMaterial color="#cbc1b0" roughness={0.24} metalness={0.32} />
      </mesh>
      <mesh position={[1.35, 0.5, ROOM.minZ + 0.2]}>
        <boxGeometry args={[4.8, 1.0, 0.34]} />
        <meshStandardMaterial color="#1b1915" roughness={0.75} />
      </mesh>

      {/* entrance glass door on the south-east corner */}
      <group position={[LANDMARKS.door.x, 0, ROOM.maxZ]}>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[1.9, 2.4, 0.06]} />
          <meshPhysicalMaterial color="#9fb4b7" transparent opacity={0.28} roughness={0.06} metalness={0.1} />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[0.06, 2.4, 0.08]} />
          <meshStandardMaterial color="#8b7a5c" metalness={0.7} roughness={0.3} />
        </mesh>
        {[-0.95, 0.95].map((x) => (
          <mesh key={x} position={[x, 1.2, 0]}>
            <boxGeometry args={[0.1, 2.45, 0.12]} />
            <meshStandardMaterial color="#17140f" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 2.5, 0]}>
          <boxGeometry args={[2.1, 0.12, 0.16]} />
          <meshStandardMaterial color="#17140f" roughness={0.6} />
        </mesh>
      </group>

      {/* skies: east (behind the glass facade) and west (beyond the terrace) */}
      <mesh position={[ROOM.maxX + 3.4, 3.2, 0.4]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[22, 9]} />
        <meshBasicMaterial ref={skyMat} color="#7e97a6" />
      </mesh>
      <mesh position={[ROOM.maxX + 3.3, 1.4, 0.4]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[22, 2.6]} />
        <meshBasicMaterial ref={skyGlow} color="#f0c58d" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh position={[-16.5, 4.2, 0.4]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[26, 12]} />
        <meshBasicMaterial ref={westSky} color="#7e97a6" />
      </mesh>

      {/* east glass facade */}
      {Array.from({ length: 9 }).map((_, i) => {
        const z = ROOM.minZ + 0.6 + i * 2.05;
        return (
          <group key={`win-${i}`}>
            <mesh position={[ROOM.maxX, 1.8, z]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[2.0, 3.4]} />
              <meshPhysicalMaterial
                color="#a8c3c8"
                transparent
                opacity={0.2}
                roughness={0.05}
                metalness={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh position={[ROOM.maxX, 1.8, z + 1.02]}>
              <boxGeometry args={[0.09, 3.5, 0.06]} />
              <meshStandardMaterial color="#161310" roughness={0.5} metalness={0.4} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[ROOM.maxX, 0.12, 0.4]}>
        <boxGeometry args={[0.16, 0.24, depth]} />
        <meshStandardMaterial color="#161310" roughness={0.7} />
      </mesh>
      <mesh position={[ROOM.maxX, 3.55, 0.4]}>
        <boxGeometry args={[0.16, 0.16, depth]} />
        <meshStandardMaterial color="#161310" roughness={0.7} />
      </mesh>

      {/* greenery: interior planters and terrace pots */}
      <Planter position={[-4.35, 0, -0.95]} length={2.6} rotation={Math.PI / 2} />
      <Planter position={[-4.35, 0, 4.6]} length={2.4} rotation={Math.PI / 2} />
      <Plant position={[-4.3, 0, 7.9]} scale={1.15} />
      <Plant position={[-10.7, 0, -7.0]} scale={1.05} />
      <Plant position={[-10.7, 0, 7.9]} scale={1.15} />
      <Plant position={[-5.6, 0, 7.9]} scale={0.95} />
      <WallSconce position={[8.2, 2.3, ROOM.minZ + 0.16]} />
      <WallSconce position={[-3.2, 2.3, ROOM.minZ + 0.16]} />

      {/* terrace parasols */}
      {[
        [-8.0, -5.4],
        [-8.0, -2.4],
        [-8.0, 1.2],
        [-8.4, 4.4],
      ].map(([x, z]) => (
        <group key={`parasol-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.035, 0.04, 2.8, 10]} />
            <meshStandardMaterial color="#2a241d" roughness={0.6} metalness={0.2} />
          </mesh>
          <mesh position={[0, 2.72, 0]} castShadow>
            <coneGeometry args={[1.45, 0.55, 12, 1, true]} />
            <meshStandardMaterial color="#d8cbb4" roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 2.44, 0]}>
            <torusGeometry args={[1.42, 0.018, 6, 24]} />
            <meshStandardMaterial color="#3a3129" metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ----------------------------------------------------------------- tables */

function TableMesh({
  table,
  sim,
  index,
  focused,
}: {
  table: Simulation["tables"][number];
  sim: Simulation;
  index: number;
  focused: boolean;
}) {
  const dims = tableDimensions(table.table);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const label = useRef<HTMLDivElement>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const glow = useRef<THREE.PointLight>(null);
  const focusMat = useRef<THREE.MeshBasicMaterial>(null);
  const slots = useMemo(() => chairSlots(table.table, table.table.id), [table]);

  useFrame(() => {
    const status = sim.tables[index]?.status ?? "free";
    const color = STATUS_COLOR[status];
    if (ringMat.current) ringMat.current.color.set(color);
    if (lamp.current) lamp.current.color.set(color);
    if (glow.current) glow.current.color.set(color);
    if (label.current) {
      const next = `${table.table.code} · ${STATUS_LABEL[status]}`;
      if (label.current.textContent !== next) label.current.textContent = next;
    }
    if (focusMat.current) focusMat.current.opacity = focused ? 0.8 : 0;
  });

  const ringInner = table.table.shape === "round" ? dims.radius + 0.66 : dims.width / 2 + 0.46;
  const ringOuter = ringInner + 0.06;

  return (
    <group name={`table-${table.table.code}`} position={[table.table.x, 0, table.table.z]} rotation={[0, table.table.rotation, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        {table.table.shape === "round" ? (
          <ringGeometry args={[ringInner, ringOuter, 48]} />
        ) : (
          <ringGeometry args={[ringInner, ringOuter, 4, 1, Math.PI / 4]} />
        )}
        <meshBasicMaterial ref={ringMat} color={STATUS_COLOR.free} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        {table.table.shape === "round" ? (
          <ringGeometry args={[ringInner - 0.06, ringInner - 0.02, 48]} />
        ) : (
          <ringGeometry args={[ringInner - 0.06, ringInner - 0.02, 4, 1, Math.PI / 4]} />
        )}
        <meshBasicMaterial ref={focusMat} color="#F6F2EA" transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {table.table.shape === "round" ? (
        <>
          <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
            <cylinderGeometry args={[dims.radius, dims.radius, 0.06, 40]} />
            <meshStandardMaterial color="#6b4a2e" roughness={0.36} />
          </mesh>
          <mesh castShadow position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.11, 0.19, 0.68, 18]} />
            <meshStandardMaterial color="#1f1912" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.32, 0.36, 0.04, 24]} />
            <meshStandardMaterial color="#191410" roughness={0.6} metalness={0.25} />
          </mesh>
        </>
      ) : (
        <>
          <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
            <boxGeometry args={[dims.width, 0.06, dims.depth]} />
            <meshStandardMaterial color="#6b4a2e" roughness={0.36} />
          </mesh>
          {[-dims.width / 2 + 0.26, dims.width / 2 - 0.26].map((x, i) => (
            <mesh key={i} position={[x, 0.36, 0]} castShadow>
              <boxGeometry args={[0.08, 0.68, dims.depth * 0.7]} />
              <meshStandardMaterial color="#1f1912" roughness={0.5} metalness={0.3} />
            </mesh>
          ))}
        </>
      )}

      {/* linen runner + candle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.757, 0]}>
        <planeGeometry args={[dims.width * 0.62, dims.depth * 0.62]} />
        <meshStandardMaterial color="#efe6d3" roughness={0.92} />
      </mesh>
      <group position={[0, 0.75, 0]}>
        <mesh>
          <cylinderGeometry args={[0.05, 0.06, 0.09, 12]} />
          <meshStandardMaterial color="#d8cdb9" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <sphereGeometry args={[0.022, 10, 8]} />
          <meshStandardMaterial ref={lamp} color={STATUS_COLOR.free} emissive="#ffb566" emissiveIntensity={1.2} />
        </mesh>
        <pointLight ref={glow} position={[0, 0.22, 0]} color="#ffb566" intensity={0.5} distance={2.2} decay={2} />
      </group>

      {/* chairs */}
      {slots.map((slot, i) => {
        const dx = slot.x - table.table.x;
        const dz = slot.z - table.table.z;
        const cos = Math.cos(table.table.rotation);
        const sin = Math.sin(table.table.rotation);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        return (
          <group key={i} position={[localX, 0, localZ]} rotation={[0, slot.rotation - table.table.rotation, 0]}>
            <mesh position={[0, 0.45, 0]} castShadow>
              <boxGeometry args={[0.44, 0.05, 0.42]} />
              <meshStandardMaterial color="#3a2a1d" roughness={0.55} />
            </mesh>
            <mesh position={[0, 0.68, -0.2]} rotation={[-0.08, 0, 0]} castShadow>
              <boxGeometry args={[0.42, 0.42, 0.05]} />
              <meshStandardMaterial color="#33251a" roughness={0.55} />
            </mesh>
            {[
              [-0.18, 0.22, -0.17],
              [0.18, 0.22, -0.17],
              [-0.18, 0.22, 0.17],
              [0.18, 0.22, 0.17],
            ].map(([x, y, z], k) => (
              <mesh key={k} position={[x, y, z]} castShadow>
                <cylinderGeometry args={[0.018, 0.014, 0.44, 8]} />
                <meshStandardMaterial color="#221a12" roughness={0.5} metalness={0.2} />
              </mesh>
            ))}
          </group>
        );
      })}

      <Html position={[0, 1.5, 0]} center distanceFactor={14} zIndexRange={[8, 0]}>
        <div className="pointer-events-none select-none rounded-full border border-cream/15 bg-ink/85 px-2 py-0.5 text-[9px] font-medium tracking-[0.08em] text-cream shadow-lg backdrop-blur-sm">
          <span ref={label} className="whitespace-nowrap">
            {table.table.code} · livre
          </span>
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ actors */

function ActorsLayer({ sim, reducedMotion }: { sim: Simulation; reducedMotion: boolean }) {
  // Guests who have left (or are in the bathroom) are unmounted so a full day
  // of service never accumulates thousands of meshes in the scene graph.
  const list = sim.actors.filter((actor) => !actor.hidden && !actor.inBathroom);
  return (
    <group>
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
  castCount,
  quality,
  reducedMotion,
  focusedTableId,
  light,
}: SimulationWorldProps) {
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.PointLight>(null);
  const spots = useRef<THREE.PointLight[]>([]);

  useFrame(() => {
    const day = light.current.dayLight;
    const night = 1 - day;
    if (ambient.current) ambient.current.intensity = 0.22 + day * 0.45;
    if (hemi.current) hemi.current.intensity = 0.18 + day * 0.45;
    if (sun.current) {
      sun.current.intensity = 0.18 + day * 1.3;
      sun.current.color.setRGB(1, 0.86 + day * 0.04, 0.74 + day * 0.16);
    }
    if (fill.current) fill.current.intensity = 6 + night * 26;
    spots.current.forEach((lamp, i) => {
      if (lamp) lamp.intensity = (quality.lamps ? 12 : 4) + night * (16 + i);
    });
  });

  return (
    <group>
      <RoomShell quality={quality} light={light} />
      <BarCounter />
      <BackBar />
      <Kitchen />
      <Chandelier position={[-2.2, 2.85, -3.4]} />
      <Chandelier position={[-0.6, 2.9, 3.4]} />
      <Chandelier position={[6.4, 2.95, -1.2]} scale={0.85} />

      {sim.tables.map((table, index) => (
        <TableMesh
          key={table.table.id}
          table={table}
          sim={sim}
          index={index}
          focused={focusedTableId === table.table.id}
        />
      ))}

      <ActorsLayer sim={sim} reducedMotion={reducedMotion} />

      {/* lamps that shift with the time of day */}
      <ambientLight ref={ambient} intensity={0.6} color="#ffe8cc" />
      <hemisphereLight ref={hemi} args={["#e9d6b6", "#0a0908", 0.5]} />
      <directionalLight
        ref={sun}
        position={[13, 17, 9]}
        intensity={1.4}
        color="#ffe0bd"
        castShadow={quality.shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <pointLight ref={fill} position={[6.4, 2.6, -1.2]} color="#ffb877" intensity={22} distance={11} decay={2} />
      {[
        [-2.2, 2.5, -3.4],
        [-0.6, 2.5, 3.4],
        [2.2, 2.7, 0.4],
        [7.6, 2.4, 5.6],
      ].map((p, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            if (el) spots.current[i] = el;
          }}
          position={p as [number, number, number]}
          color="#ffc48a"
          intensity={12}
          distance={9}
          decay={2}
        />
      ))}
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
