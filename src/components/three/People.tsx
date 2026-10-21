"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { HAIR_TONES, SHIRT_TONES, SKIN_TONES } from "./materials";

type PersonProps = {
  position: [number, number, number];
  rotation?: number;
  seated?: boolean;
  variant?: number;
  behavior?: "talk" | "eat" | "drink" | "wait" | "menu" | "serve";
  reducedMotion?: boolean;
  scale?: number;
  staff?: boolean;
  name?: string;
};

function pick<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

/**
 * Stylised 3D human figure built from primitives. Deliberately not photoreal —
 * the interface labels these as "figuras 3D estilizadas". Limbs and head are
 * animated procedurally (no mixer) so every guest moves differently.
 */
export function Person({
  position,
  rotation = 0,
  seated = false,
  variant = 0,
  behavior = "talk",
  reducedMotion = false,
  scale = 1,
  staff = false,
  name,
}: PersonProps) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const torso = useRef<Group>(null);

  const palette = useMemo(() => {
    const seed = variant * 7 + 3;
    return {
      skin: pick(SKIN_TONES, seed),
      hair: pick(HAIR_TONES, seed + 2),
      shirt: staff ? pick(["#15120e", "#1b1712"] as const, seed) : pick(SHIRT_TONES, seed + 1),
      phase: (variant % 13) / 13,
      drinkArm: (variant % 3) / 3,
    };
  }, [variant, staff]);

  useFrame((state) => {
    if (reducedMotion) return;
    const t = state.clock.elapsedTime + palette.phase * 12;
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.55) * (behavior === "talk" ? 0.32 : 0.12);
      head.current.rotation.x = Math.sin(t * 0.42 + 1.3) * 0.05 + (behavior === "eat" ? 0.12 : 0);
    }
    if (leftArm.current) {
      const swing = Math.sin(t * 0.7) * 0.08;
      leftArm.current.rotation.x = behavior === "eat" ? -0.55 + Math.sin(t * 1.4) * 0.28 : -0.12 + swing;
      leftArm.current.rotation.z = -0.05;
    }
    if (rightArm.current) {
      const raise =
        behavior === "drink" || behavior === "serve"
          ? -1.05 + Math.sin(t * 0.9 + palette.drinkArm * 6) * 0.3
          : behavior === "menu"
            ? -0.7 + Math.sin(t * 0.5) * 0.06
            : behavior === "wait"
              ? -0.55 + Math.sin(t * 0.35) * 0.04
              : -0.1 + Math.sin(t * 0.62 + 2) * 0.07;
      rightArm.current.rotation.x = raise;
      rightArm.current.rotation.z = 0.06;
    }
    if (torso.current) {
      torso.current.rotation.z = Math.sin(t * 0.35) * 0.012;
      torso.current.position.y = (seated ? 0.52 : 0.98) + Math.sin(t * 0.8) * 0.004;
    }
    if (root.current && !seated) {
      root.current.position.y = position[1] + Math.sin(t * 0.7) * 0.006;
    }
  });

  const torsoY = seated ? 0.78 : 1.22;
  const hipY = seated ? 0.46 : 0.9;

  return (
    <group ref={root} name={name} position={position} rotation={[0, rotation, 0]} scale={scale}>
      {/* legs */}
      <mesh position={[-0.1, seated ? 0.24 : 0.44, seated ? 0.16 : 0]} castShadow={!seated}>
        <capsuleGeometry args={[0.075, seated ? 0.32 : 0.72, 4, 8]} />
        <meshStandardMaterial color="#221f1b" roughness={0.9} />
      </mesh>
      <mesh position={[0.1, seated ? 0.24 : 0.44, seated ? 0.16 : 0]} castShadow={!seated}>
        <capsuleGeometry args={[0.075, seated ? 0.32 : 0.72, 4, 8]} />
        <meshStandardMaterial color="#221f1b" roughness={0.9} />
      </mesh>

      <group ref={torso} position={[0, torsoY, 0]}>
        {/* torso */}
        <mesh castShadow>
          <capsuleGeometry args={[0.17, seated ? 0.3 : 0.4, 5, 10]} />
          <meshStandardMaterial color={palette.shirt} roughness={0.85} />
        </mesh>
        {/* neck + head */}
        <mesh position={[0, 0.33, 0]}>
          <cylinderGeometry args={[0.055, 0.065, 0.09, 8]} />
          <meshStandardMaterial color={palette.skin} roughness={0.75} />
        </mesh>
        <group ref={head} position={[0, 0.42, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.125, 20, 18]} />
            <meshStandardMaterial color={palette.skin} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.055, -0.012]} rotation={[0.15, 0, 0]}>
            <sphereGeometry args={[0.128, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
            <meshStandardMaterial color={palette.hair} roughness={0.9} />
          </mesh>
          {variant % 4 === 0 && (
            <mesh position={[0, 0.02, -0.12]} rotation={[Math.PI / 2.4, 0, 0]}>
              <coneGeometry args={[0.07, 0.34, 8]} />
              <meshStandardMaterial color={palette.hair} roughness={0.95} />
            </mesh>
          )}
        </group>
        {/* arms */}
        <group ref={leftArm} position={[-0.21, 0.2, 0]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.055, 0.36, 4, 8]} />
            <meshStandardMaterial color={palette.shirt} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.055, 10, 8]} />
            <meshStandardMaterial color={palette.skin} roughness={0.7} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.21, 0.2, 0]}>
          <mesh castShadow>
            <capsuleGeometry args={[0.055, 0.36, 4, 8]} />
            <meshStandardMaterial color={palette.shirt} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.26, 0]}>
            <sphereGeometry args={[0.055, 10, 8]} />
            <meshStandardMaterial color={palette.skin} roughness={0.7} />
          </mesh>
          {staff && (
            <mesh position={[0, -0.34, 0.14]} rotation={[0.1, 0, 0]}>
              <cylinderGeometry args={[0.2, 0.18, 0.02, 20]} />
              <meshStandardMaterial color="#c6a66b" metalness={0.85} roughness={0.3} />
            </mesh>
          )}
        </group>
        {staff && (
          <mesh position={[0, -0.24, 0.16]} rotation={[0.2, 0, 0]}>
            <cylinderGeometry args={[0.19, 0.17, 0.025, 20]} />
            <meshStandardMaterial color="#bfa06a" metalness={0.8} roughness={0.35} />
          </mesh>
        )}
      </group>

      {seated && (
        <mesh position={[0, 0.34, 0.26]} rotation={[0.15, 0, 0]}>
          <boxGeometry args={[0.26, 0.08, 0.22]} />
          <meshStandardMaterial color={palette.shirt} roughness={0.9} />
        </mesh>
      )}
      {!seated && (
        <mesh position={[0, hipY, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.18, 10]} />
          <meshStandardMaterial color="#221f1b" roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}

/** A stylised guest sitting at a table, subtly animated. */
export function Guest({
  position,
  rotation,
  variant,
  behavior,
  reducedMotion,
}: {
  position: [number, number, number];
  rotation: number;
  variant: number;
  behavior: PersonProps["behavior"];
  reducedMotion?: boolean;
}) {
  return (
    <Person
      position={position}
      rotation={rotation}
      seated
      variant={variant}
      behavior={behavior}
      reducedMotion={reducedMotion}
      scale={0.96 + (variant % 3) * 0.03}
      name="guest"
    />
  );
}

/** Waiter walking a loop between kitchen pass and dining tables. */
export function WalkingWaiter({
  points,
  speed = 0.045,
  offset = 0,
  reducedMotion,
  carrying = true,
}: {
  points: [number, number][];
  speed?: number;
  offset?: number;
  reducedMotion?: boolean;
  carrying?: boolean;
}) {
  const group = useRef<Group>(null);
  const path = useMemo(() => points, [points]);

  useFrame((state) => {
    if (!group.current || reducedMotion) return;
    const t = (state.clock.elapsedTime * speed + offset) % 1;
    const scaled = t * path.length;
    const index = Math.floor(scaled);
    const next = (index + 1) % path.length;
    const local = scaled - index;
    const [x1, z1] = path[index];
    const [x2, z2] = path[next];
    const x = x1 + (x2 - x1) * local;
    const z = z1 + (z2 - z1) * local;
    group.current.position.set(x, 0, z);
    const target = Math.atan2(x2 - x1, z2 - z1);
    const current = group.current.rotation.y;
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    group.current.rotation.y = current + delta * 0.1;
  });

  return (
    <group ref={group} position={[points[0][0], 0, points[0][1]]}>
      <Person
        position={[0, 0, 0]}
        rotation={0}
        variant={7}
        behavior={carrying ? "serve" : "talk"}
        staff
        reducedMotion={false}
        scale={1.02}
      />
    </group>
  );
}
