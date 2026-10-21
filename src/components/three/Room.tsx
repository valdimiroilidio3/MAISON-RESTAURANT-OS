"use client";

import { useMemo } from "react";
import { Instance, Instances } from "@react-three/drei";
import * as THREE from "three";
import { chairSlots, type SceneTable, type SceneZone } from "./room-types";
import { createFloorTexture } from "./materials";
import {
  BackBar,
  BarCounter,
  Chairs,
  Chandelier,
  DiningTable,
  Kitchen,
  Plant,
  Planter,
  WallSconce,
} from "./Furniture";
import { Guest, Person, WalkingWaiter } from "./People";
import type { TableStatus } from "@/lib/types";

export interface RoomQuality {
  shadows: boolean;
  guests: boolean;
  candles: boolean;
  labels: boolean;
}

const INTERIOR = { minX: -4.8, maxX: 9.6, minZ: -7.8, maxZ: 8.8 };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function RoomShell({ quality }: { quality: RoomQuality }) {
  const stone = useMemo(() => {
    const texture = createFloorTexture("stone");
    texture.repeat.set(7, 8);
    return texture;
  }, []);
  const woodDeck = useMemo(() => {
    const texture = createFloorTexture("wood");
    texture.repeat.set(3.4, 8.4);
    return texture;
  }, []);
  const barFloor = useMemo(() => {
    const texture = createFloorTexture("bar");
    texture.repeat.set(4, 5);
    return texture;
  }, []);

  const cityWindows = useMemo(() => {
    const random = mulberry32(20261021);
    return Array.from({ length: 90 }).map(() => ({
      y: 2 + random() * 9,
      z: -12 + random() * 26,
      x: 15.4 + random() * 2,
      w: 0.18 + random() * 0.3,
      h: 0.16 + random() * 0.5,
      warm: random() > 0.35,
    }));
  }, []);

  return (
    <group>
      {/* interior stone floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(INTERIOR.minX + INTERIOR.maxX) / 2, 0, (INTERIOR.minZ + INTERIOR.maxZ) / 2]} receiveShadow>
        <planeGeometry args={[INTERIOR.maxX - INTERIOR.minX, INTERIOR.maxZ - INTERIOR.minZ]} />
        <meshStandardMaterial map={stone} color="#8d8577" roughness={0.42} metalness={0.12} />
      </mesh>
      {/* bar floor inset */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[6.5, 0.004, -3.2]} receiveShadow>
        <planeGeometry args={[6.2, 8.8]} />
        <meshStandardMaterial map={barFloor} color="#6f6a62" roughness={0.5} metalness={0.08} />
      </mesh>
      {/* terrace deck */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-8.1, -0.02, 0.5]} receiveShadow>
        <planeGeometry args={[6.6, 16.6]} />
        <meshStandardMaterial map={woodDeck} color="#8b7256" roughness={0.72} />
      </mesh>
      {/* terrace edge */}
      <mesh position={[-8.1, 0.02, 8.8]}>
        <boxGeometry args={[6.6, 0.06, 0.08]} />
        <meshStandardMaterial color="#1c1712" />
      </mesh>

      {/* back wall left + header + right */}
      <mesh position={[-3.15, 1.85, INTERIOR.minZ]} receiveShadow castShadow>
        <boxGeometry args={[3.3, 3.7, 0.22]} />
        <meshStandardMaterial color="#26221d" roughness={0.92} />
      </mesh>
      <mesh position={[6.05, 1.85, INTERIOR.minZ]} receiveShadow castShadow>
        <boxGeometry args={[7.1, 3.7, 0.22]} />
        <meshStandardMaterial color="#26221d" roughness={0.92} />
      </mesh>
      <mesh position={[1.0, 3.1, INTERIOR.minZ]} receiveShadow>
        <boxGeometry args={[4.4, 1.2, 0.22]} />
        <meshStandardMaterial color="#26221d" roughness={0.92} />
      </mesh>
      {/* kitchen pass header + counter */}
      <mesh position={[1.0, 1.12, -7.72]}>
        <boxGeometry args={[4.4, 0.1, 0.34]} />
        <meshStandardMaterial color="#c9bfae" roughness={0.25} metalness={0.3} />
      </mesh>

      {/* east glass facade */}
      <group>
        {Array.from({ length: 8 }).map((_, i) => {
          const z = -6.7 + i * 2.2;
          return (
            <mesh key={`glass-e-${i}`} position={[INTERIOR.maxX, 1.75, z]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[2.2, 3.5]} />
              <meshStandardMaterial
                color="#7d8f9d"
                transparent
                opacity={0.16}
                roughness={0.05}
                metalness={0.4}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}
        {Array.from({ length: 9 }).map((_, i) => (
          <mesh key={`mull-e-${i}`} position={[INTERIOR.maxX, 1.8, -7.8 + i * 2.2]} castShadow>
            <boxGeometry args={[0.08, 3.6, 0.1]} />
            <meshStandardMaterial color="#15130f" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[INTERIOR.maxX, 3.62, 0.5]}>
          <boxGeometry args={[0.22, 0.22, 16.6]} />
          <meshStandardMaterial color="#17140f" />
        </mesh>
      </group>

      {/* west glass wall with a door gap between z 0.8 and 2.4 */}
      <group>
        {[
          [-7.8, 0.8],
          [2.4, 8.8],
        ].map(([start, end], index) => (
          <mesh key={`glass-w-${index}`} position={[-4.8, 1.8, (start + end) / 2]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[end - start, 3.4]} />
            <meshStandardMaterial
              color="#7d8f9d"
              transparent
              opacity={0.14}
              roughness={0.05}
              metalness={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
        {[-7.8, -5.4, -3.1, -0.8, 0.8, 2.4, 4.9, 7.1, 8.8].map((z, i) => (
          <mesh key={`mull-w-${i}`} position={[-4.8, 1.8, z]} castShadow>
            <boxGeometry args={[0.08, 3.6, 0.1]} />
            <meshStandardMaterial color="#15130f" metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[-4.8, 3.1, 1.6]}>
          <boxGeometry args={[0.08, 1.0, 1.6]} />
          <meshStandardMaterial color="#15130f" metalness={0.4} roughness={0.5} />
        </mesh>
      </group>

      {/* ceiling beams + track */}
      {[-6, -2, 2, 6].map((z) => (
        <group key={`beam-${z}`}>
          <mesh position={[2.4, 3.68, z]}>
            <boxGeometry args={[14.4, 0.2, 0.24]} />
            <meshStandardMaterial color="#14110d" roughness={0.9} />
          </mesh>
          <mesh position={[2.4, 3.56, z]}>
            <boxGeometry args={[14.2, 0.04, 0.05]} />
            <meshStandardMaterial color="#5b4a35" metalness={0.7} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {[-2.4, 5.4].map((x) => (
        <mesh key={`beam-x-${x}`} position={[x, 3.72, 0.5]}>
          <boxGeometry args={[0.2, 0.16, 16.2]} />
          <meshStandardMaterial color="#14110d" roughness={0.9} />
        </mesh>
      ))}

      {/* city backdrop + windows */}
      <mesh position={[18, 8, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[44, 22]} />
        <meshBasicMaterial color="#0b1219" />
      </mesh>
      <Instances limit={cityWindows.length}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffd9a0" transparent opacity={0.75} />
        {cityWindows.map((w, i) => (
          <Instance
            key={i}
            position={[w.x, w.y, w.z]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[w.w, w.h, 1]}
            color={w.warm ? "#ffd7a1" : "#cfe0ea"}
          />
        ))}
      </Instances>

      {/* terrace railing + pergola */}
      <group>
        {[-8.1, -4.9].map((x) => (
          <mesh key={`post-${x}`} position={[x, 1.4, 8.75]}>
            <boxGeometry args={[0.09, 2.8, 0.09]} />
            <meshStandardMaterial color="#1a1611" metalness={0.4} roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[-9.8, 1.02, 8.75]}>
          <boxGeometry args={[3.4, 0.06, 0.06]} />
          <meshStandardMaterial color="#3c3327" metalness={0.6} />
        </mesh>
        {Array.from({ length: 8 }).map((_, i) => (
          <mesh key={`bulb-${i}`} position={[-11.2 + i * 0.19, 2.72, 8.55]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshBasicMaterial color="#ffd9a1" />
          </mesh>
        ))}
        <mesh position={[-8.0, 2.85, 8.7]}>
          <boxGeometry args={[6.5, 0.03, 0.03]} />
          <meshStandardMaterial color="#2a231b" />
        </mesh>
        <mesh position={[-11.25, 0.65, 0.5]}>
          <boxGeometry args={[0.05, 1.3, 16.4]} />
          <meshStandardMaterial color="#6d7d84" transparent opacity={0.18} roughness={0.05} metalness={0.4} />
        </mesh>
        {[-4, 3.4].map((z) => (
          <mesh key={`bollard-${z}`} position={[-10.7, 0.4, z]}>
            <cylinderGeometry args={[0.06, 0.08, 0.8, 10]} />
            <meshStandardMaterial color="#171310" />
          </mesh>
        ))}
        {[-4, 3.4].map((z) => (
          <mesh key={`bollard-light-${z}`} position={[-10.7, 0.84, z]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshBasicMaterial color="#ffcf94" />
          </mesh>
        ))}
      </group>

      {/* sconces + plants */}
      <WallSconce position={[9.4, 1.55, -4.6]} rotation={-Math.PI / 2} />
      <WallSconce position={[9.4, 1.55, 2.2]} rotation={-Math.PI / 2} />
      <WallSconce position={[-4.6, 1.6, -6.2]} rotation={Math.PI / 2} />
      <WallSconce position={[-4.6, 1.6, 5.6]} rotation={Math.PI / 2} />
      <WallSconce position={[0.2, 1.7, -7.6]} />
      <WallSconce position={[4.2, 1.7, -7.6]} />

      <Planter position={[-4.5, 0, -1.0]} length={2.2} rotation={Math.PI / 2} />
      <Planter position={[-4.5, 0, 4.6]} length={2.4} rotation={Math.PI / 2} />
      <Planter position={[9.3, 0, 5.8]} length={3.2} rotation={Math.PI / 2} />
      <Planter position={[9.3, 0, -1.9]} length={2.4} rotation={Math.PI / 2} />
      <Planter position={[-6.8, 0, 7.9]} length={3.8} />
      <Planter position={[-9.9, 0, -7.4]} length={2.6} rotation={Math.PI / 2} />

      <Plant position={[-11.0, 0, -5.6]} scale={1.15} />
      <Plant position={[-11.1, 0, 6.9]} scale={1.25} />
      <Plant position={[8.9, 0, 8.1]} scale={1.05} />
      <Plant position={[-4.6, 0, -7.1]} scale={0.9} />
      <Plant position={[3.0, 0, 8.2]} scale={0.85} />

      {quality.shadows && (
        <mesh position={[2.4, 0.005, 0.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[14, 16]} />
          <meshBasicMaterial color="#0a0908" transparent opacity={0.02} />
        </mesh>
      )}
    </group>
  );
}

const SEATING_STATUSES: TableStatus[] = ["occupied", "order_pending", "awaiting_payment"];

function Diners({
  tables,
  quality,
  dimZone,
  reducedMotion,
}: {
  tables: SceneTable[];
  quality: RoomQuality;
  dimZone: string | null;
  reducedMotion: boolean;
}) {
  const guests = useMemo(() => {
    if (!quality.guests) return [];
    return tables
      .filter((t) => t.status && SEATING_STATUSES.includes(t.status) && (!dimZone || t.zoneSlug === dimZone))
      .flatMap((table) => {
        const count = Math.min(table.seats, Math.max(1, table.guests ?? 2), 6);
        return chairSlots(table, table.id)
          .slice(0, count)
          .map((slot, i) => {
            const behavior =
              table.status === "order_pending"
                ? i % 2 === 0
                  ? "wait"
                  : i % 3 === 0
                    ? "menu"
                    : "talk"
                : table.status === "awaiting_payment"
                  ? i === 0
                    ? "menu"
                    : "talk"
                  : i % 4 === 0
                    ? "eat"
                    : i % 4 === 1
                      ? "drink"
                      : "talk";
            return {
              id: `${table.id}-${i}`,
              position: [slot.x, 0, slot.z] as [number, number, number],
              rotation: slot.rotation,
              variant: table.id * 5 + i,
              behavior: behavior as "talk" | "eat" | "drink" | "wait" | "menu",
            };
          });
      });
  }, [tables, quality.guests, dimZone]);

  return (
    <group>
      {guests.map((guest) => (
        <Guest
          key={guest.id}
          position={guest.position}
          rotation={guest.rotation}
          variant={guest.variant}
          behavior={guest.behavior}
          reducedMotion={reducedMotion}
        />
      ))}

      {/* kitchen brigade at the pass */}
      <Person position={[0.1, 0, -8.05]} rotation={Math.PI} variant={3} behavior="talk" staff reducedMotion={reducedMotion} />
      <Person position={[2.1, 0, -8.2]} rotation={Math.PI * 0.92} variant={5} behavior="menu" staff reducedMotion={reducedMotion} />

      {/* waiter at the bar, and one walking the floor */}
      <Person position={[7.9, 0, -3.7]} rotation={Math.PI * 0.9} variant={9} behavior="serve" staff reducedMotion={reducedMotion} />
      {!reducedMotion && (
        <WalkingWaiter
          points={[
            [0.8, 2.6],
            [-2.4, 1.4],
            [-2.8, -2.6],
            [1.2, -2.4],
            [4.4, 2.2],
            [0.8, 2.6],
          ]}
          speed={0.035}
          offset={0.1}
        />
      )}
    </group>
  );
}

function Chandeliers({ quality }: { quality: RoomQuality }) {
  return (
    <group>
      <Chandelier position={[-2.2, 2.85, -3.4]} />
      <Chandelier position={[-0.6, 2.9, 3.4]} />
      <Chandelier position={[6.4, 2.95, -1.2]} scale={0.85} />
      {quality.shadows && (
        <>
          <pointLight position={[-2.2, 2.5, -3.4]} color="#ffbf82" intensity={26} distance={9} decay={2} />
          <pointLight position={[-0.6, 2.5, 3.4]} color="#ffbf82" intensity={26} distance={9} decay={2} />
        </>
      )}
    </group>
  );
}

export function DiningRoomScene({
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
}: {
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
}) {
  return (
    <group>
      <RoomShell quality={quality} />
      <Chairs tables={tables} />
      {tables.map((table) => (
        <DiningTable
          key={table.id}
          table={table}
          selected={selectedId === table.id}
          hovered={hoveredId === table.id}
          dimmed={!!dimZone && table.zoneSlug !== dimZone}
          preview={mode === "preview"}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
      <BarCounter />
      <BackBar />
      <Kitchen />
      <Chandeliers quality={quality} />
      <Diners tables={tables} quality={quality} dimZone={dimZone} reducedMotion={reducedMotion} />

      {/* lighting */}
      <ambientLight intensity={0.55} color="#ffe8cc" />
      <hemisphereLight args={["#e9d6b6", "#0a0908", 0.5]} />
      <directionalLight
        position={[9, 15, 9]}
        intensity={1.35}
        color="#ffe0bd"
        castShadow={quality.shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={45}
      />
      {/* practical lights are part of the high-quality budget only — low-end devices fall back
          to ambient/hemisphere/directional so the shader never has to loop over 10+ lights */}
      {quality.shadows && (
        <>
          <pointLight position={[6.4, 2.6, -1.2]} color="#ffb877" intensity={22} distance={10} decay={2} />
          <pointLight position={[1.0, 2.7, -8.2]} color="#ffc890" intensity={16} distance={8} decay={2} />
          <pointLight position={[-8.2, 2.6, 2.0]} color="#ffcf9a" intensity={12} distance={9} decay={2} />
          <spotLight
            position={[-2.0, 6.4, 2.2]}
            angle={0.7}
            penumbra={0.8}
            intensity={50}
            distance={16}
            color="#ffe3c2"
            castShadow={false}
          />
        </>
      )}
      {/* zone legends are rendered in the HTML overlay; this group only holds geometry */}
      <group name={`zones:${zones.map((z) => z.slug).join(",")}`} visible={false} />
    </group>
  );
}
