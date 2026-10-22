"use client";

/**
 * The building shell: floors at three levels, the partitions with their real
 * openings, the perimeter soffit and beams that make the room read as enclosed,
 * the terrace railing, the WC vestibule and the kitchen behind the pass.
 *
 * Every coordinate comes from `@/lib/scene/layout`; this file contains no
 * placement constants of its own (only construction details: reveals, frames,
 * rail spacing).
 */

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  ENTRANCE,
  FLOOR_LEVEL,
  ROOM_BOUNDS,
  INTERIOR,
  KITCHEN,
  OPENINGS,
  PARTITIONS,
  PASS_OPENING,
  TERRACE,
  WALL,
  WC_DOOR,
  type Opening,
  type WallRun,
} from "@/lib/scene/layout";
import { createFloorTexture } from "../materials";

const PALETTE = {
  stone: "#ded7c9",
  deck: "#cbb496",
  wall: "#3a332b",
  wallTrim: "#1d1a15",
  frame: "#14110d",
  brass: "#b8965d",
  soffit: "#191612",
};

function FloorPlates() {
  const stone = useMemo(() => {
    const texture = createFloorTexture("stone");
    texture.repeat.set(7, 8.4);
    return texture;
  }, []);
  const deck = useMemo(() => {
    const texture = createFloorTexture("wood");
    texture.repeat.set(3.4, 8.4);
    return texture;
  }, []);

  const interiorWidth = INTERIOR.maxX - INTERIOR.minX;
  const interiorDepth = INTERIOR.maxZ - INTERIOR.minZ;
  const terraceWidth = TERRACE.maxX - TERRACE.minX;
  const terraceDepth = TERRACE.maxZ - TERRACE.minZ;

  return (
    <group name="floors">
      {/* dining room — interior floor at y = 0 */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(INTERIOR.minX + INTERIOR.maxX) / 2, FLOOR_LEVEL.interior, (INTERIOR.minZ + INTERIOR.maxZ) / 2]}
        receiveShadow
      >
        <planeGeometry args={[interiorWidth, interiorDepth]} />
        <meshStandardMaterial map={stone} color={PALETTE.stone} roughness={0.52} metalness={0.06} />
      </mesh>

      {/* terrace deck, one step down, with a stone threshold at the door */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(TERRACE.minX + TERRACE.maxX) / 2, FLOOR_LEVEL.terrace, (TERRACE.minZ + TERRACE.maxZ) / 2]}
        receiveShadow
      >
        <planeGeometry args={[terraceWidth, terraceDepth]} />
        <meshStandardMaterial map={deck} color={PALETTE.deck} roughness={0.78} metalness={0.02} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[INTERIOR.minX, FLOOR_LEVEL.threshold, 1.6]}
        receiveShadow
      >
        <planeGeometry args={[0.42, 1.9]} />
        <meshStandardMaterial color="#a9a294" roughness={0.35} metalness={0.12} />
      </mesh>
      {/* step face so the level change is visible */}
      <mesh position={[INTERIOR.minX - 0.01, FLOOR_LEVEL.terrace / 2, (TERRACE.minZ + TERRACE.maxZ) / 2]}>
        <boxGeometry args={[0.04, Math.abs(FLOOR_LEVEL.terrace), terraceDepth]} />
        <meshStandardMaterial color="#2b2620" roughness={0.8} />
      </mesh>

      {/* the building sits on a plinth, so the floor never looks like a decal
          floating on the forecourt */}
      <mesh position={[(ROOM_BOUNDS.minX + ROOM_BOUNDS.maxX) / 2, -0.16, (ROOM_BOUNDS.minZ + ROOM_BOUNDS.maxZ) / 2]}>
        <boxGeometry
          args={[ROOM_BOUNDS.maxX - ROOM_BOUNDS.minX + 0.7, 0.3, ROOM_BOUNDS.maxZ - ROOM_BOUNDS.minZ + 0.7]}
        />
        <meshStandardMaterial color="#2f2a24" roughness={0.92} />
      </mesh>

      {/* entrance mat inside the door */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(ENTRANCE.from + ENTRANCE.to) / 2, 0.004, INTERIOR.maxZ - 0.75]} receiveShadow>
        <planeGeometry args={[1.5, 1.3]} />
        <meshStandardMaterial color="#33291f" roughness={0.95} />
      </mesh>
    </group>
  );
}

function WallRunMesh({ wall }: { wall: WallRun }) {
  const length = wall.to - wall.from;
  const mid = (wall.from + wall.to) / 2;
  const isGlass = wall.material === "glass";
  const position: [number, number, number] =
    wall.axis === "z" ? [wall.at, wall.height / 2, mid] : [mid, wall.height / 2, wall.at];
  const size: [number, number, number] =
    wall.axis === "z" ? [wall.thickness, wall.height, length] : [length, wall.height, wall.thickness];

  if (isGlass) {
    return (
      <group name={`wall-${wall.id}`}>
        <mesh position={position}>
          <boxGeometry args={size} />
          <meshPhysicalMaterial
            color="#b7c6c6"
            transparent
            opacity={0.14}
            roughness={0.04}
            metalness={0.15}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        {/* sill + head rail give the glass a physical edge */}
        {[0.06, wall.height - 0.06].map((y) => (
          <mesh key={y} position={[position[0], y, position[2]]} castShadow>
            <boxGeometry args={wall.axis === "z" ? [0.09, 0.1, length] : [length, 0.1, 0.09]} />
            <meshStandardMaterial color={PALETTE.frame} roughness={0.42} metalness={0.35} />
          </mesh>
        ))}
        {/* mullions every ~2 m */}
        {Array.from({ length: Math.max(2, Math.round(length / 2.05)) + 1 }).map((_, i) => {
          const t = i / Math.max(1, Math.round(length / 2.05));
          const at = wall.from + t * length;
          return (
            <mesh
              key={`m-${i}`}
              position={wall.axis === "z" ? [wall.at, wall.height / 2, at] : [at, wall.height / 2, wall.at]}
              castShadow
            >
              <boxGeometry args={wall.axis === "z" ? [0.08, wall.height, 0.08] : [0.08, wall.height, 0.08]} />
              <meshStandardMaterial color={PALETTE.frame} roughness={0.4} metalness={0.4} />
            </mesh>
          );
        })}
      </group>
    );
  }

  return (
    <group name={`wall-${wall.id}`}>
      <mesh position={position} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.92} metalness={0.02} />
      </mesh>
      {/* plaster dado: a lighter band that catches the practical light */}
      <mesh position={[position[0], 0.52, position[2]]}>
        <boxGeometry args={wall.axis === "z" ? [wall.thickness + 0.02, 1.04, length] : [length, 1.04, wall.thickness + 0.02]} />
        <meshStandardMaterial color="#463d33" roughness={0.88} />
      </mesh>
      <mesh position={[position[0], 0.06, position[2]]}>
        <boxGeometry args={wall.axis === "z" ? [wall.thickness + 0.03, 0.12, length] : [length, 0.12, wall.thickness + 0.03]} />
        <meshStandardMaterial color={PALETTE.wallTrim} roughness={0.7} />
      </mesh>
    </group>
  );
}

function OpeningDetails({ opening }: { opening: Opening }) {
  const width = opening.to - opening.from;
  const mid = (opening.from + opening.to) / 2;
  const head = opening.head;
  const lintelY = head + (WALL.height - head) / 2;
  const lintelHeight = Math.max(0.2, WALL.height - head);

  return (
    <group name={`opening-${opening.id}`}>
      {/* lintel above the opening */}
      <mesh position={opening.axis === "z" ? [opening.at, lintelY, mid] : [mid, lintelY, opening.at]} castShadow>
        <boxGeometry
          args={opening.axis === "z" ? [WALL.thickness + 0.04, lintelHeight, width] : [width, lintelHeight, WALL.thickness + 0.04]}
        />
        <meshStandardMaterial color={PALETTE.wall} roughness={0.9} />
      </mesh>
      {/* jambs */}
      {[opening.from, opening.to].map((edge) => (
        <mesh
          key={edge}
          position={opening.axis === "z" ? [opening.at, head / 2, edge] : [edge, head / 2, opening.at]}
          castShadow
        >
          <boxGeometry args={opening.axis === "z" ? [WALL.thickness + 0.04, head, 0.07] : [0.07, head, WALL.thickness + 0.04]} />
          <meshStandardMaterial color={PALETTE.frame} roughness={0.6} metalness={0.12} />
        </mesh>
      ))}
      {/* door leaves / pass counter top */}
      {opening.kind === "entrance" && (
        <group position={[opening.at, 0, mid]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (width / 4), head / 2, 0]} rotation={[0, side * 0.28, 0]}>
              <boxGeometry args={[width / 2 - 0.06, head - 0.08, 0.05]} />
              <meshPhysicalMaterial color="#a9c2c4" transparent opacity={0.24} roughness={0.06} metalness={0.2} />
            </mesh>
          ))}
          <mesh position={[0, head + 0.06, 0]}>
            <boxGeometry args={[width + 0.16, 0.1, 0.18]} />
            <meshStandardMaterial color={PALETTE.brass} metalness={0.85} roughness={0.32} />
          </mesh>
        </group>
      )}
      {opening.kind === "door" && (
        <group position={opening.axis === "z" ? [opening.at, 0, mid] : [mid, 0, opening.at]}>
          {/* glazed upper panel so the leaf never reads as a solid block */}
          <mesh position={opening.axis === "z" ? [0.04, head * 0.68, 0] : [0, head * 0.68, 0.04]}>
            <boxGeometry args={opening.axis === "z" ? [0.02, head * 0.42, width - 0.24] : [width - 0.24, head * 0.42, 0.02]} />
            <meshStandardMaterial color="#8c9a97" transparent opacity={0.42} roughness={0.1} metalness={0.2} />
          </mesh>
          <mesh
            position={[0, head / 2, 0]}
            rotation={[0, opening.axis === "z" ? 0 : 0, 0]}
          >
            <boxGeometry args={opening.axis === "z" ? [0.05, head - 0.06, width - 0.06] : [width - 0.06, head - 0.06, 0.05]} />
            {/* a warm oak leaf with a glazed panel, not a black slab */}
            <meshStandardMaterial color="#4a3826" roughness={0.5} metalness={0.06} />
          </mesh>
          <mesh position={opening.axis === "z" ? [0.04, 1.02, width / 2 - 0.16] : [width / 2 - 0.16, 1.02, 0.04]}>
            <boxGeometry args={opening.axis === "z" ? [0.05, 0.04, 0.16] : [0.16, 0.04, 0.05]} />
            <meshStandardMaterial color={PALETTE.brass} metalness={0.9} roughness={0.25} />
          </mesh>
        </group>
      )}
      {opening.kind === "pass" && (
        <mesh position={opening.axis === "z" ? [opening.at, opening.sill, mid] : [mid, opening.sill, opening.at]} castShadow>
          <boxGeometry args={opening.axis === "z" ? [0.46, 0.08, width] : [width, 0.08, 0.46]} />
          <meshStandardMaterial color="#cbc1b0" roughness={0.26} metalness={0.3} />
        </mesh>
      )}
    </group>
  );
}

/**
 * The soffit is a *ceiling* detail, so it exists only over the enclosed room.
 * Running it around the whole footprint used to draw a floating roof edge over
 * the open terrace, which read as a building with a missing roof.
 */
function PerimeterSoffit() {
  const minX = INTERIOR.minX;
  const maxX = INTERIOR.maxX;
  const minZ = INTERIOR.minZ - 0.5;
  const maxZ = INTERIOR.maxZ;
  const band = WALL.soffitDepth;
  const y = WALL.height - 0.06;

  return (
    <group name="soffit">
      {[
        { position: [(minX + maxX) / 2, y, minZ + band / 2] as [number, number, number], size: [maxX - minX, 0.12, band] as [number, number, number] },
        { position: [(minX + maxX) / 2, y, maxZ - band / 2] as [number, number, number], size: [maxX - minX, 0.12, band] as [number, number, number] },
        { position: [minX + band / 2, y, (minZ + maxZ) / 2] as [number, number, number], size: [band, 0.12, maxZ - minZ] as [number, number, number] },
        { position: [maxX - band / 2, y, (minZ + maxZ) / 2] as [number, number, number], size: [band, 0.12, maxZ - minZ] as [number, number, number] },
      ].map((piece, i) => (
        <mesh key={i} position={piece.position} castShadow>
          <boxGeometry args={piece.size} />
          <meshStandardMaterial color={PALETTE.soffit} roughness={0.85} />
        </mesh>
      ))}
      {/* structural beams over the dining room */}
      {[-5.2, -1.4, 2.4, 6.2].map((z) => (
        <group key={z}>
          <mesh position={[(INTERIOR.minX + INTERIOR.maxX) / 2, WALL.beamHeight, z]}>
            <boxGeometry args={[INTERIOR.maxX - INTERIOR.minX, 0.18, 0.2]} />
            <meshStandardMaterial color="#15110e" roughness={0.9} />
          </mesh>
          <mesh position={[(INTERIOR.minX + INTERIOR.maxX) / 2, WALL.beamHeight - 0.12, z]}>
            <boxGeometry args={[INTERIOR.maxX - INTERIOR.minX - 0.2, 0.03, 0.05]} />
            <meshStandardMaterial color="#5b4a35" metalness={0.7} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TerraceRail() {
  const posts: number[] = [];
  for (let z = TERRACE.minZ + 0.2; z <= TERRACE.maxZ - 0.05; z += 1.05) posts.push(z);
  return (
    <group name="terrace-rail">
      {/* west rail */}
      <mesh position={[TERRACE.minX + 0.04, 1.04, (TERRACE.minZ + TERRACE.maxZ) / 2]}>
        <boxGeometry args={[0.07, 0.06, TERRACE.maxZ - TERRACE.minZ]} />
        <meshStandardMaterial color={PALETTE.brass} metalness={0.7} roughness={0.34} />
      </mesh>
      {posts.map((z) => (
        <mesh key={`p-${z}`} position={[TERRACE.minX + 0.04, 0.52, z]}>
          <boxGeometry args={[0.035, 1.04, 0.035]} />
          <meshStandardMaterial color="#6f6353" metalness={0.45} roughness={0.5} />
        </mesh>
      ))}
      {/* south rail (street side) */}
      <mesh position={[(TERRACE.minX + TERRACE.maxX) / 2, 1.04, TERRACE.maxZ - 0.04]}>
        <boxGeometry args={[TERRACE.maxX - TERRACE.minX, 0.06, 0.07]} />
        <meshStandardMaterial color={PALETTE.brass} metalness={0.7} roughness={0.34} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={`s-${i}`} position={[TERRACE.minX + 0.3 + i * 0.94, 0.52, TERRACE.maxZ - 0.04]}>
          <boxGeometry args={[0.035, 1.04, 0.035]} />
          <meshStandardMaterial color="#6f6353" metalness={0.45} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Small vestibule behind the WC door so the opening never looks into the void.
 * It is three walls and a floor — a solid `BackSide` box reads as a black
 * monolith the moment the camera gets close, which is exactly what the
 * entrance preset does.
 */
function WcVestibule() {
  const minX = WC_DOOR.from - 0.55;
  const maxX = WC_DOOR.to + 0.35;
  const depth = 1.45;
  const wallFace = INTERIOR.minZ - 0.11;
  const back = wallFace - depth;
  const midX = (minX + maxX) / 2;
  const width = maxX - minX;
  const height = 2.6;
  const lining = "#2a241d";

  return (
    <group name="wc">
      {/* floor + ceiling of the niche */}
      <mesh position={[midX, 0.002, (wallFace + back) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#37302a" roughness={0.72} />
      </mesh>
      {/* back wall */}
      <mesh position={[midX, height / 2, back]} receiveShadow>
        <boxGeometry args={[width, height, 0.08]} />
        <meshStandardMaterial color={lining} roughness={0.88} />
      </mesh>
      {/* side walls */}
      {[minX, maxX].map((x) => (
        <mesh key={x} position={[x, height / 2, (wallFace + back) / 2]} receiveShadow>
          <boxGeometry args={[0.08, height, depth]} />
          <meshStandardMaterial color={lining} roughness={0.88} />
        </mesh>
      ))}
      {/* a mirror and a towel rail give the niche a reason to be lit */}
      <mesh position={[midX, 1.45, back + 0.05]}>
        <planeGeometry args={[0.62, 1.1]} />
        <meshStandardMaterial color="#6b7472" roughness={0.12} metalness={0.6} />
      </mesh>
      <mesh position={[midX, 1.05, back + 0.16]}>
        <boxGeometry args={[0.7, 0.03, 0.16]} />
        <meshStandardMaterial color="#8b7a5c" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[midX, 2.35, back + 0.3]}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * The kitchen is modelled as a shallow working box behind the pass wall: a pass
 * shelf, a stainless range, a hood and two warm work lights. Chefs stand inside
 * it, at the same coordinates the simulation uses.
 */
function KitchenWing() {
  // Geometry comes from the plan, not from constants local to this component.
  const back = KITCHEN.minZ;
  const from = KITCHEN.minX;
  const to = KITCHEN.maxX;
  const depth = KITCHEN.maxZ - KITCHEN.minZ;
  const midX = (from + to) / 2;
  return (
    <group name="kitchen">
      <mesh position={[midX, 1.55, back - 0.1]} receiveShadow>
        <boxGeometry args={[to - from, 3.1, 0.2]} />
        <meshStandardMaterial color="#191b1d" roughness={0.9} />
      </mesh>
      <mesh position={[midX, 0.01, (back + INTERIOR.minZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[to - from, depth - 0.2]} />
        <meshStandardMaterial color="#33383b" roughness={0.4} metalness={0.35} />
      </mesh>
      {/* range blocks */}
      {[from + 1.1, from + 2.9, from + 4.7].map((x, i) => (
        <mesh key={i} position={[x, 0.46, back + 0.62]} castShadow>
          <boxGeometry args={[1.2, 0.92, 0.68]} />
          <meshStandardMaterial color="#9aa0a2" roughness={0.34} metalness={0.72} />
        </mesh>
      ))}
      {/* hood */}
      <mesh position={[midX, 2.35, back + 0.5]}>
        <boxGeometry args={[to - from - 0.4, 0.42, 1.0]} />
        <meshStandardMaterial color="#2b2f31" roughness={0.5} metalness={0.45} />
      </mesh>
      {/* heat lamps over the pass */}
      {[-0.6, 0.6].map((offset) => (
        <group key={offset} position={[midX + offset, 2.2, INTERIOR.minZ - 0.5]}>
          <mesh>
            <cylinderGeometry args={[0.11, 0.11, 0.2, 12]} />
            <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.19, 0.19, 0.3, 12, 1, true]} />
            <meshBasicMaterial color="#ffc078" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * A cutaway ceiling: real over the enclosed room, gone the moment the camera
 * rises above it. Without it the beams open onto the sky (a white band across
 * every guest-level view); with it always on, the overview camera would stare at
 * a slab. The rule is geometric, not a per-view flag: above 4.2 m the roof
 * disappears, below 3.1 m it is fully closed, and it fades in between.
 */
function CutawayCeiling() {
  const { camera } = useThree();
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const slab = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const y = camera.position.y;
    const visibility = 1 - THREE.MathUtils.smoothstep(y, 3.1, 4.6);
    if (material.current) {
      material.current.opacity = visibility * 0.98;
      material.current.visible = visibility > 0.01;
    }
    if (slab.current) slab.current.visible = visibility > 0.01;
  });

  const width = INTERIOR.maxX - INTERIOR.minX;
  const depth = INTERIOR.maxZ - INTERIOR.minZ + 0.5;
  const midX = (INTERIOR.minX + INTERIOR.maxX) / 2;
  const midZ = (INTERIOR.minZ + INTERIOR.maxZ) / 2 - 0.25;

  return (
    <mesh ref={slab} position={[midX, WALL.height + 0.02, midZ]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial ref={material} color="#2e2822" roughness={0.95} transparent opacity={0.98} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function Shell() {
  return (
    <group name="shell">
      <FloorPlates />
      {PARTITIONS.map((wall) => (
        <WallRunMesh key={wall.id} wall={wall} />
      ))}
      {OPENINGS.map((opening) => (
        <OpeningDetails key={opening.id} opening={opening} />
      ))}
      <PerimeterSoffit />
      <CutawayCeiling />
      <TerraceRail />
      <WcVestibule />
      <KitchenWing />
      {/* east sky-lit planter strip is part of the fixtures; the facade itself
          is the glass run above (wall-east) */}
    </group>
  );
}
