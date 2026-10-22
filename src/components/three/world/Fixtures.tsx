"use client";

/**
 * Fixed furniture and props, all anchored to `FIXTURES` / `PARASOLS` /
 * `PRACTICALS` from the canonical layout. Nothing here decides where a piece of
 * furniture goes — only how it is built.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FIXTURES, PARASOLS, PRACTICALS, POTS, type Fixture } from "@/lib/scene/layout";
import { createBlobTexture } from "../materials";

const WOOD = "#3a2c20";
const WOOD_DARK = "#241c15";
const BRASS = "#b8965d";
const CREAM = "#efe7d8";
const MARBLE = "#cfc6b6";

function centre(fixture: Fixture): [number, number, number] {
  return [(fixture.footprint.minX + fixture.footprint.maxX) / 2, 0, (fixture.footprint.minZ + fixture.footprint.maxZ) / 2];
}

function size(fixture: Fixture): [number, number] {
  return [fixture.footprint.maxX - fixture.footprint.minX, fixture.footprint.maxZ - fixture.footprint.minZ];
}

/** Soft contact shadow under a footprint, so furniture sits on the floor. */
function GroundBlob({ x, z, width, depth }: { x: number; z: number; width: number; depth: number }) {
  const texture = useMemo(() => createBlobTexture(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.008, z]} renderOrder={1}>
      <planeGeometry args={[width + 0.7, depth + 0.7]} />
      <meshBasicMaterial map={texture} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function BarCounter({ fixture }: { fixture: Fixture }) {
  const [cx, , cz] = centre(fixture);
  const [width, depth] = size(fixture);
  return (
    <group name={fixture.id} position={[cx, 0, cz]}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 1.0, depth]} />
        <meshStandardMaterial color="#241c15" roughness={0.55} metalness={0.12} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[width + 0.12, 0.06, depth + 0.16]} />
        <meshStandardMaterial color={MARBLE} roughness={0.22} metalness={0.2} />
      </mesh>
      {/* brass foot rail */}
      <mesh position={[0, 0.18, depth / 2 + 0.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, width - 0.3, 8]} />
        <meshStandardMaterial color={BRASS} metalness={0.95} roughness={0.28} />
      </mesh>
      {/* pendant lights over the bar */}
      {[-width * 0.3, 0, width * 0.3].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.72, 0]}>
            <cylinderGeometry args={[0.01, 0.01, 0.5, 6]} />
            <meshStandardMaterial color="#1b1712" />
          </mesh>
          <mesh position={[0, 1.46, 0]}>
            <coneGeometry args={[0.11, 0.16, 14, 1, true]} />
            <meshStandardMaterial color="#c8bda9" roughness={0.4} metalness={0.5} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 1.4, 0]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <GroundBlob x={0} z={0} width={width} depth={depth} />
    </group>
  );
}

function BackBar({ fixture }: { fixture: Fixture }) {
  const [cx, , cz] = centre(fixture);
  const [width] = size(fixture);
  const bottles = useRef<THREE.InstancedMesh>(null);

  // Rows of bottles behind the bar: one instanced mesh with per-bottle colour.
  const shelf = useMemo(() => {
    let seed = 4242;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    return [0.92, 1.32, 1.72].flatMap((y, row) =>
      Array.from({ length: Math.max(6, Math.round(width / 0.62)) }).map((_, i) => ({
        x: -width / 2 + 0.4 + i * 0.62 + (row % 2) * 0.12,
        y,
        h: 0.24 + rand() * 0.12,
        tone: row === 1 ? "#5c3a1e" : row === 2 ? "#2d3d2f" : "#3d2a1a",
      })),
    );
  }, [width]);

  useLayoutEffect(() => {
    const mesh = bottles.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const colour = new THREE.Color();
    shelf.forEach((bottle, index) => {
      matrix.compose(new THREE.Vector3(bottle.x, bottle.y + bottle.h / 2, 0.28), new THREE.Quaternion(), new THREE.Vector3(1, bottle.h, 1));
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, colour.set(bottle.tone));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [shelf]);

  return (
    <group name={fixture.id} position={[cx, 0, cz]}>
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 3.0, 0.24]} />
        <meshStandardMaterial color="#1a1612" roughness={0.85} />
      </mesh>
      {[0.78, 1.18, 1.58, 1.98].map((y) => (
        <mesh key={y} position={[0, y, 0.26]}>
          <boxGeometry args={[width - 0.2, 0.035, 0.36]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.6} />
        </mesh>
      ))}
      <instancedMesh ref={bottles} args={[undefined, undefined, shelf.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.042, 0.048, 1, 8]} />
        <meshStandardMaterial roughness={0.3} metalness={0.1} emissiveIntensity={0.16} />
      </instancedMesh>
      <mesh position={[0, 2.12, 0.2]}>
        <boxGeometry args={[width - 0.3, 0.02, 0.04]} />
        <meshBasicMaterial color="#ffc88a" toneMapped={false} />
      </mesh>
    </group>
  );
}

function PassCounter({ fixture }: { fixture: Fixture }) {
  const [cx, , cz] = centre(fixture);
  const [width] = size(fixture);
  return (
    <group name={fixture.id} position={[cx, 0, cz]}>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 1.04, 0.48]} />
        <meshStandardMaterial color="#1b1915" roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.06, 0]} castShadow>
        <boxGeometry args={[width + 0.08, 0.06, 0.56]} />
        <meshStandardMaterial color={MARBLE} roughness={0.26} metalness={0.22} />
      </mesh>
    </group>
  );
}

function HostDesk({ fixture }: { fixture: Fixture }) {
  const [cx, , cz] = centre(fixture);
  const [width, depth] = size(fixture);
  return (
    <group name={fixture.id} position={[cx, 0, cz]}>
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 1.04, depth]} />
        <meshStandardMaterial color="#2b231b" roughness={0.6} metalness={0.08} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[width + 0.06, 0.05, depth + 0.06]} />
        <meshStandardMaterial color={MARBLE} roughness={0.24} metalness={0.2} />
      </mesh>
      {/* reservation book + lamp */}
      <mesh position={[-0.12, 1.09, 0.02]} rotation={[0, 0.2, 0]}>
        <boxGeometry args={[0.26, 0.03, 0.34]} />
        <meshStandardMaterial color="#3a2a1d" roughness={0.7} />
      </mesh>
      <group position={[0.24, 1.08, 0]}>
        <mesh>
          <cylinderGeometry args={[0.03, 0.05, 0.06, 12]} />
          <meshStandardMaterial color={BRASS} metalness={0.85} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <sphereGeometry args={[0.04, 10, 8]} />
          <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Planter({ fixture }: { fixture: Fixture }) {
  const [cx, , cz] = centre(fixture);
  const [width, depth] = size(fixture);
  const along = width >= depth;
  const length = along ? width : depth;
  const shrubs = useMemo(() => {
    const count = Math.max(2, Math.round(length / 0.55));
    return Array.from({ length: count }).map((_, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1);
      return {
        offset: (t - 0.5) * (length - 0.5),
        y: 0.62 + ((i * 7) % 4) * 0.05,
        scale: 0.21 + ((i * 3) % 5) * 0.02,
        tone: i % 2 === 0 ? "#3f5b3a" : "#2f4a31",
      };
    });
  }, [length]);

  return (
    <group name={fixture.id} position={[cx, 0, cz]}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.44, depth]} />
        <meshStandardMaterial color="#211c16" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <boxGeometry args={[width - 0.08, 0.02, depth - 0.08]} />
        <meshStandardMaterial color="#14100c" roughness={0.95} />
      </mesh>
      {shrubs.map((shrub, i) => (
        <mesh
          key={i}
          position={along ? [shrub.offset, shrub.y, 0] : [0, shrub.y, shrub.offset]}
          castShadow
        >
          <icosahedronGeometry args={[shrub.scale, 1]} />
          <meshStandardMaterial color={shrub.tone} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export function Pots() {
  return (
    <group name="pots">
      {POTS.map((pot) => (
        <group key={pot.id} position={[pot.x, 0, pot.z]}>
          <mesh position={[0, pot.r * 0.9, 0]} castShadow>
            <cylinderGeometry args={[pot.r, pot.r * 0.82, pot.r * 1.8, 18]} />
            <meshStandardMaterial color="#2a231c" roughness={0.85} />
          </mesh>
          <mesh position={[0, pot.r * 1.85, 0]} castShadow>
            <icosahedronGeometry args={[pot.r * 1.05, 1]} />
            <meshStandardMaterial color="#35503a" roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Parasol anchored on its table (pole through the centre, as in reality). */
export function Parasols() {
  return (
    <group name="parasols">
      {PARASOLS.map((parasol) => (
        <group key={parasol.id} position={[parasol.x, 0, parasol.z]}>
          <mesh position={[0, parasol.height / 2, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.04, parasol.height, 10]} />
            <meshStandardMaterial color="#2a241d" roughness={0.55} metalness={0.25} />
          </mesh>
          <mesh position={[0, parasol.height, 0]} castShadow>
            <coneGeometry args={[parasol.radius, 0.46, 16, 1, true]} />
            <meshStandardMaterial color="#d8cbb4" roughness={0.92} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, parasol.height - 0.24, 0]}>
            <torusGeometry args={[parasol.radius - 0.02, 0.016, 6, 28]} />
            <meshStandardMaterial color="#3a3129" metalness={0.4} roughness={0.5} />
          </mesh>
          {/* canopy ribs */}
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            return (
              <mesh
                key={i}
                position={[Math.cos(angle) * parasol.radius * 0.5, parasol.height - 0.12, Math.sin(angle) * parasol.radius * 0.5]}
                rotation={[0, -angle, Math.PI / 2 - 0.18]}
              >
                <cylinderGeometry args={[0.008, 0.008, parasol.radius, 4]} />
                <meshStandardMaterial color="#4a4038" roughness={0.6} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

/**
 * Chandeliers: brass rings with candle bulbs. They carry no light of their own —
 * `Lighting` owns every light in the scene, so the draw-call and light budgets
 * stay fixed no matter how many fixtures are added.
 */
export function Chandeliers() {
  return (
    <group name="chandeliers">
      {PRACTICALS.chandeliers.map((fixture, index) => (
        <group key={index} position={[fixture.x, fixture.y, fixture.z]}>
          <mesh position={[0, 0.86, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 1.3, 6]} />
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
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (i / 6) * Math.PI * 2;
            return (
              <group key={i} position={[Math.cos(angle) * 0.46, 0.02, Math.sin(angle) * 0.46]}>
                <mesh position={[0, 0.14, 0]}>
                  <cylinderGeometry args={[0.026, 0.026, 0.26, 8]} />
                  <meshStandardMaterial color={CREAM} roughness={0.4} emissive="#ffcf94" emissiveIntensity={1.1} />
                </mesh>
                <mesh position={[0, 0.3, 0]}>
                  <sphereGeometry args={[0.045, 10, 8]} />
                  <meshBasicMaterial color="#ffd9a2" toneMapped={false} />
                </mesh>
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
}

/** Wall sconces: emissive only (no light) to keep the GPU light budget fixed. */
export function Sconces() {
  return (
    <group name="sconces">
      {PRACTICALS.sconces.map((sconce, index) => (
        <group key={index} position={[sconce.x, sconce.y, sconce.z]} rotation={[0, sconce.rotation, 0]}>
          <mesh>
            <boxGeometry args={[0.06, 0.32, 0.07]} />
            <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshBasicMaterial color="#ffd7a0" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.26, 0.1]}>
            <sphereGeometry args={[0.16, 12, 10]} />
            <meshBasicMaterial color="#ffbe80" transparent opacity={0.16} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Fixtures() {
  return (
    <group name="fixtures">
      {FIXTURES.map((fixture) => {
        if (fixture.kind === "counter" && fixture.id === "bar-counter") return <BarCounter key={fixture.id} fixture={fixture} />;
        if (fixture.kind === "counter") return <BackBar key={fixture.id} fixture={fixture} />;
        if (fixture.kind === "pass") return <PassCounter key={fixture.id} fixture={fixture} />;
        if (fixture.kind === "desk") return <HostDesk key={fixture.id} fixture={fixture} />;
        if (fixture.kind === "planter") return <Planter key={fixture.id} fixture={fixture} />;
        return null;
      })}
      <Pots />
      <Parasols />
      <Chandeliers />
      <Sconces />
    </group>
  );
}

export const FIXTURE_COLORS = { WOOD, WOOD_DARK, BRASS, CREAM, MARBLE };
