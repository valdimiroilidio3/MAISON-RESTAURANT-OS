"use client";

import { useMemo, useRef } from "react";
import { Html, Instance, Instances, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TABLE_STATUS_META } from "@/lib/status";
import { chairSlots, tableDimensions, type SceneTable } from "./room-types";

const WOOD = "#3a2c20";
const WOOD_DARK = "#241c15";
const BRASS = "#b8965d";
const CREAM = "#efe7d8";

export function Chairs({ tables }: { tables: SceneTable[] }) {
  const slots = useMemo(() => tables.flatMap((t) => chairSlots(t, t.id)), [tables]);
  const seatColor = "#2a2119";

  return (
    <group>
      <Instances limit={slots.length} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.07, 0.44]} />
        <meshStandardMaterial color={seatColor} roughness={0.75} />
        {slots.map((slot, i) => (
          <Instance key={`seat-${i}`} position={[slot.x, 0.46, slot.z]} rotation={[0, slot.rotation, 0]} />
        ))}
      </Instances>
      <Instances limit={slots.length} castShadow>
        <boxGeometry args={[0.44, 0.52, 0.05]} />
        <meshStandardMaterial color="#221a13" roughness={0.8} />
        {slots.map((slot, i) => {
          const backX = slot.x - 0.2 * Math.sin(slot.rotation);
          const backZ = slot.z - 0.2 * Math.cos(slot.rotation);
          return <Instance key={`back-${i}`} position={[backX, 0.74, backZ]} rotation={[0.06, slot.rotation, 0]} />;
        })}
      </Instances>
      <Instances limit={slots.length * 4}>
        <boxGeometry args={[0.045, 0.44, 0.045]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.6} metalness={0.15} />
        {slots.flatMap((slot, i) => {
          const cos = Math.cos(slot.rotation);
          const sin = Math.sin(slot.rotation);
          return [
            [-0.18, -0.17],
            [0.18, -0.17],
            [-0.17, 0.17],
            [0.17, 0.17],
          ].map(([lx, lz], j) => {
            const x = slot.x + lx * cos + lz * sin;
            const z = slot.z - lx * sin + lz * cos;
            return <Instance key={`leg-${i}-${j}`} position={[x, 0.23, z]} rotation={[0, slot.rotation, 0]} />;
          });
        })}
      </Instances>
    </group>
  );
}

function PlaceSetting({ x, z, rotation }: { x: number; z: number; rotation: number }) {
  return (
    <group position={[x, 0.78, z]} rotation={[0, rotation, 0]}>
      <mesh>
        <cylinderGeometry args={[0.135, 0.135, 0.012, 24]} />
        <meshStandardMaterial color={CREAM} roughness={0.35} metalness={0.02} />
      </mesh>
      <mesh position={[0.22, 0.01, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.16, 6]} />
        <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0.32, 0.05, 0.02]}>
        <cylinderGeometry args={[0.035, 0.03, 0.12, 12, 1, true]} />
        <meshStandardMaterial color="#cfdcd9" transparent opacity={0.42} roughness={0.1} metalness={0.1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function DiningTable({
  table,
  selected,
  hovered,
  dimmed,
  preview,
  onSelect,
  onHover,
}: {
  table: SceneTable;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  preview: boolean;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
}) {
  const dims = tableDimensions(table);
  const ringRef = useRef<THREE.Mesh>(null);
  const slots = useMemo(() => chairSlots(table, table.id), [table]);
  const meta = table.status ? TABLE_STATUS_META[table.status] : null;
  const ringColor = preview ? "#C6A66B" : meta?.dot ?? "#C6A66B";
  const active = selected || hovered;

  useFrame((state) => {
    if (ringRef.current && active) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.2) * 0.035;
      ringRef.current.scale.set(pulse, pulse, 1);
    }
  });

  const inner = table.shape === "round" ? dims.radius + 0.7 : dims.width / 2 + 0.5;
  const outer = inner + 0.07;

  return (
    <group name={`table-${table.code}`} position={[table.x, 0, table.z]} rotation={[0, table.rotation, 0]}>
      {/* selection + status ring, always paired with a text label so colour is never the only signal */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        {table.shape === "round" ? (
          <ringGeometry args={[dims.radius + 0.68, dims.radius + 0.75, 64]} />
        ) : (
          <ringGeometry args={[inner, outer, 4, 1, Math.PI / 4]} />
        )}
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={dimmed ? 0.12 : selected ? 0.95 : hovered ? 0.7 : 0.42}
          side={THREE.DoubleSide}
        />
      </mesh>
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.024, 0]}>
          {table.shape === "round" ? (
            <ringGeometry args={[dims.radius + 0.9, dims.radius + 0.94, 64]} />
          ) : (
            <ringGeometry args={[inner + 0.22, inner + 0.26, 4, 1, Math.PI / 4]} />
          )}
          <meshBasicMaterial color="#F6F2EA" transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* top */}
      {table.shape === "round" ? (
        <>
          <mesh castShadow receiveShadow position={[0, 0.72, 0]}>
            <cylinderGeometry args={[dims.radius, dims.radius, 0.065, 48]} />
            <meshStandardMaterial color={WOOD} roughness={0.42} metalness={0.06} />
          </mesh>
          <mesh castShadow position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.12, 0.2, 0.68, 16]} />
            <meshStandardMaterial color="#1f1912" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.34, 0.38, 0.04, 24]} />
            <meshStandardMaterial color="#191410" roughness={0.6} metalness={0.25} />
          </mesh>
        </>
      ) : (
        <>
          <RoundedBox
            args={[dims.width, 0.065, dims.depth]}
            radius={0.025}
            smoothness={2}
            position={[0, 0.72, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={WOOD} roughness={0.42} metalness={0.06} />
          </RoundedBox>
          {[-dims.width / 2 + 0.28, dims.width / 2 - 0.28].map((x, i) => (
            <mesh key={i} position={[x, 0.36, 0]} castShadow>
              <boxGeometry args={[0.09, 0.68, dims.depth * 0.72]} />
              <meshStandardMaterial color="#1f1912" roughness={0.5} metalness={0.3} />
            </mesh>
          ))}
        </>
      )}

      {/* settings + candle */}
      {slots.slice(0, 8).map((slot, i) => {
        const dx = slot.x - table.x;
        const dz = slot.z - table.z;
        const cos = Math.cos(table.rotation);
        const sin = Math.sin(table.rotation);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        const pull = 0.22;
        const len = Math.hypot(localX, localZ) || 1;
        return (
          <PlaceSetting
            key={i}
            x={localX - (localX / len) * pull}
            z={localZ - (localZ / len) * pull}
            rotation={slot.rotation - table.rotation}
          />
        );
      })}
      <group position={[0, 0.75, 0]}>
        <mesh>
          <cylinderGeometry args={[0.055, 0.065, 0.1, 12]} />
          <meshStandardMaterial color="#d8cdb9" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <sphereGeometry args={[0.028, 8, 8]} />
          <meshBasicMaterial color="#ffb566" />
        </mesh>
      </group>

      {/* invisible hit area above the table */}
      <mesh
        position={[0, 1.0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = "pointer";
          onHover(table.id);
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
          onHover(null);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(table.id);
        }}
      >
        <planeGeometry args={[dims.width + 1.6, dims.depth + 1.6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <Html position={[0, 1.55, 0]} center distanceFactor={15} zIndexRange={[10, 0]}>
        <div
          className="pointer-events-none flex -translate-y-1 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-medium tracking-[0.08em] whitespace-nowrap shadow-lg backdrop-blur-sm"
          style={{
            backgroundColor: "rgba(10,9,8,0.86)",
            borderColor: active ? ringColor : "rgba(246,242,234,0.14)",
            color: dimmed ? "#8a8478" : "#F6F2EA",
            opacity: dimmed ? 0.45 : 1,
          }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: preview ? "#C6A66B" : ringColor, opacity: 0.9 }}
          />
          {table.code}
          {!preview && table.guests ? <span className="text-[8px] text-[#A39C8F]">· {table.guests}p</span> : null}
          {!preview && meta && table.status !== "available" ? (
            <span className="text-[8px] uppercase tracking-[0.12em]" style={{ color: ringColor }}>
              {meta.short}
            </span>
          ) : null}
        </div>
      </Html>
    </group>
  );
}

export function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const foliage = useMemo(() => {
    const seed = Math.abs(position[0] * 13 + position[2] * 7);
    return Array.from({ length: 4 }).map((_, i) => ({
      x: Math.sin(seed + i * 2.4) * 0.22,
      y: 0.62 + i * 0.17,
      z: Math.cos(seed + i * 1.7) * 0.2,
      s: 0.26 + ((seed + i) % 5) * 0.03,
    }));
  }, [position]);

  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.26, 0.2, 0.44, 16]} />
        <meshStandardMaterial color="#2a231c" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.04, 16]} />
        <meshStandardMaterial color="#171310" roughness={0.9} />
      </mesh>
      {foliage.map((leaf, i) => (
        <mesh key={i} position={[leaf.x, leaf.y, leaf.z]} castShadow>
          <icosahedronGeometry args={[leaf.s, 1]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#3f5b3a" : "#2f4a31"} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Planter({ position, length = 2.4, rotation = 0 }: { position: [number, number, number]; length?: number; rotation?: number }) {
  const leaves = useMemo(() => {
    const count = Math.max(3, Math.round(length / 0.7));
    return Array.from({ length: count }).map((_, i) => ({
      x: -length / 2 + 0.4 + (i * (length - 0.8)) / Math.max(1, count - 1),
      y: 0.62 + (i % 3) * 0.08,
      s: 0.2 + (i % 4) * 0.035,
    }));
  }, [length]);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, 0.4, 0.46]} />
        <meshStandardMaterial color="#211c16" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.405, 0]}>
        <boxGeometry args={[length - 0.08, 0.02, 0.38]} />
        <meshStandardMaterial color="#14100c" roughness={0.95} />
      </mesh>
      {leaves.map((leaf, i) => (
        <mesh key={i} position={[leaf.x, leaf.y, 0]} castShadow>
          <icosahedronGeometry args={[leaf.s, 1]} />
          <meshStandardMaterial color={i % 2 ? "#415c3c" : "#324c33"} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Chandelier({ position, scale = 1, lit = true }: { position: [number, number, number]; scale?: number; lit?: boolean }) {
  const bulbs = 6;
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.4, 6]} />
        <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.46, 0.022, 8, 40]} />
        <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.18, 0]}>
        <torusGeometry args={[0.26, 0.014, 8, 32]} />
        <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.3} />
      </mesh>
      {Array.from({ length: bulbs }).map((_, i) => {
        const angle = (i / bulbs) * Math.PI * 2;
        const x = Math.cos(angle) * 0.46;
        const z = Math.sin(angle) * 0.46;
        return (
          <group key={i} position={[x, 0.02, z]}>
            <mesh position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.026, 0.026, 0.26, 8]} />
              <meshStandardMaterial color={CREAM} roughness={0.4} emissive="#ffcf94" emissiveIntensity={lit ? 1.6 : 0.4} />
            </mesh>
            <mesh position={[0, 0.3, 0]}>
              <sphereGeometry args={[0.05, 10, 8]} />
              <meshBasicMaterial color={lit ? "#ffd9a2" : "#6b5c45"} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshBasicMaterial color="#ffd9a2" />
      </mesh>
    </group>
  );
}

export function BarCounter() {
  return (
    <group position={[6.0, 0, -5.15]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.4, 1.0, 0.62]} />
        <meshStandardMaterial color="#241c15" roughness={0.55} metalness={0.15} />
      </mesh>
      <mesh position={[0, 1.03, 0]} castShadow>
        <boxGeometry args={[5.6, 0.06, 0.74]} />
        <meshStandardMaterial color="#cfc3af" roughness={0.22} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.16, 0.72]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 5.2, 6]} />
        <meshStandardMaterial color={BRASS} metalness={0.95} roughness={0.28} />
      </mesh>
      {[-2.2, -1.1, 0, 1.1, 2.2].map((x) => (
        <group key={x} position={[x, 1.1, 0]}>
          <mesh position={[0, 0.12, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.085, 0.16, 12, 1, true]} />
            <meshStandardMaterial color="#d6dcd5" transparent opacity={0.35} roughness={0.1} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.11, 0.09, 0.02, 16]} />
            <meshStandardMaterial color="#cabfa9" roughness={0.3} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function BackBar() {
  const bottles = useMemo(() => {
    const rows = [0.95, 1.35, 1.75];
    return rows.flatMap((y, row) =>
      Array.from({ length: 9 }).map((_, i) => ({
        x: -3.3 + i * 0.78 + (row % 2) * 0.12,
        y,
        color: row === 1 ? "#5c3a1e" : "#2d3d2f",
        h: 0.26 + ((i + row) % 3) * 0.04,
      })),
    );
  }, []);

  return (
    <group position={[6.3, 0, -7.35]}>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[7.2, 3.0, 0.22]} />
        <meshStandardMaterial color="#1a1612" roughness={0.85} />
      </mesh>
      {[0.78, 1.18, 1.58, 1.98].map((y, i) => (
        <mesh key={i} position={[0, y, 0.22]}>
          <boxGeometry args={[6.9, 0.035, 0.34]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.6} />
        </mesh>
      ))}
      {bottles.map((b, i) => (
        <mesh key={i} position={[b.x, b.y + b.h / 2, 0.24]}>
          <cylinderGeometry args={[0.045, 0.05, b.h, 8]} />
          <meshStandardMaterial
            color={b.color}
            roughness={0.25}
            metalness={0.1}
            emissive={b.color}
            emissiveIntensity={0.12}
          />
        </mesh>
      ))}
      <mesh position={[0, 2.1, 0.16]}>
        <boxGeometry args={[6.9, 0.02, 0.04]} />
        <meshBasicMaterial color="#ffc88a" />
      </mesh>
      <pointLight position={[0, 2.0, 0.7]} color="#ffb877" intensity={2.6} distance={4.6} decay={2} />
    </group>
  );
}

export function Kitchen() {
  const steel = "#9aa0a2";
  return (
    <group>
      <mesh position={[1.0, 1.9, -9.1]} receiveShadow>
        <boxGeometry args={[5.6, 3.8, 0.2]} />
        <meshStandardMaterial color="#15171a" roughness={0.8} />
      </mesh>
      <mesh position={[1.0, 0.01, -9.0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[5.6, 2.6]} />
        <meshStandardMaterial color="#3a3f42" roughness={0.35} metalness={0.4} />
      </mesh>
      {[-1.2, 0.2, 1.6, 3.0].map((x, i) => (
        <mesh key={i} position={[x, 0.45, -8.4]} castShadow>
          <boxGeometry args={[1.2, 0.9, 0.7]} />
          <meshStandardMaterial color={steel} roughness={0.3} metalness={0.75} />
        </mesh>
      ))}
      <mesh position={[1.0, 2.45, -8.7]}>
        <boxGeometry args={[4.8, 0.32, 1.0]} />
        <meshStandardMaterial color="#2b2f31" roughness={0.5} metalness={0.5} />
      </mesh>
      {[-0.8, 0.4, 1.6, 2.8].map((x, i) => (
        <group key={i} position={[x, 2.15, -8.3]}>
          <mesh>
            <cylinderGeometry args={[0.13, 0.13, 0.22, 12]} />
            <meshBasicMaterial color="#ffd9a0" />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.3, 12, 1, true]} />
            <meshBasicMaterial color="#ffc078" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[1.0, 1.95, -8.6]}>
        <boxGeometry args={[4.6, 0.5, 0.06]} />
        <meshStandardMaterial color="#101214" roughness={0.9} />
      </mesh>
      <pointLight position={[1.0, 2.6, -8.4]} color="#ffbf80" intensity={3.2} distance={6} decay={2} />
    </group>
  );
}

export function WallSconce({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh>
        <boxGeometry args={[0.06, 0.34, 0.08]} />
        <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshBasicMaterial color="#ffd7a0" />
      </mesh>
      {/* faked light pool keeps the six sconces free of real lights (fixed GPU light budget) */}
      <mesh position={[0, 0.3, 0.12]}>
        <sphereGeometry args={[0.17, 12, 10]} />
        <meshBasicMaterial color="#ffbe80" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}
