"use client";

/**
 * The outside world: a closed sky dome, atmospheric fog and a distant city
 * silhouette behind the glazed facade. No billboards or floating planes — the
 * dome follows the scene, so orbiting can never reveal an edge.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { SKY_PALETTES, createFloorTexture, createSkyGeometry } from "../materials";

export interface DayLightRef {
  current: { dayLight: number };
}

export function SkyDome({ light }: { light: DayLightRef }) {
  // Paving, not void: the forecourt is the same generator as the interior floor,
  // tinted dark, so the ground catches light and the building is *standing* on
  // something instead of floating in a black plane.
  const paving = useMemo(() => {
    const texture = createFloorTexture("stone");
    // ~2.3 m slabs: readable paving, not a plaid blanket
    texture.repeat.set(120, 120);
    texture.needsUpdate = true;
    return texture;
  }, []);
  const dayGeometry = useMemo(() => createSkyGeometry(150, SKY_PALETTES.day), []);
  const nightGeometry = useMemo(() => createSkyGeometry(152, SKY_PALETTES.night), []);
  const dayMat = useRef<THREE.MeshBasicMaterial>(null);
  const { scene } = useThree();

  // Fog belongs to the *outside*, and its colour is the sky's own horizon colour
  // (see SKY_PALETTES.day.ground), so the paving dissolving into it leaves no
  // seam: the horizon is a haze line, not a wall. `near`/`far` are lerped every
  // frame between the day and night values below.
  const fog = useMemo(() => new THREE.Fog("#efe4cd", 70, 150), []);
  const fogColor = useMemo(
    () => ({ day: new THREE.Color("#efe4cd"), night: new THREE.Color("#141a26") }),
    [],
  );

  useFrame(() => {
    const day = light.current.dayLight;
    if (dayMat.current) dayMat.current.opacity = Math.min(1, Math.max(0, day));
    scene.fog = fog;
    fog.color.copy(fogColor.night).lerp(fogColor.day, day);
    fog.near = THREE.MathUtils.lerp(26, 70, day);
    fog.far = THREE.MathUtils.lerp(90, 150, day);
  });

  return (
    <group name="environment">
      {/* night shell (opaque) and day shell (faded in) — both inside-out spheres */}
      <mesh geometry={nightGeometry} renderOrder={-2} frustumCulled={false}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh geometry={dayGeometry} renderOrder={-1} frustumCulled={false}>
        <meshBasicMaterial
          ref={dayMat}
          vertexColors
          side={THREE.BackSide}
          transparent
          opacity={1}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
      {/* A finite forecourt, not a planet. It is deliberately darker than the
          room so the lit interior stays the focal point, and it ends inside the
          fog so the horizon is a haze line instead of an endless plane. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} receiveShadow>
        <circleGeometry args={[140, 72]} />
        <meshStandardMaterial map={paving} color="#6d6557" roughness={1} metalness={0} />
      </mesh>
      {/* the street: a lit strip on the glazed side, so the city has a reason to
          be there and the forecourt is not an undifferentiated void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[14.6, -0.325, 0]} receiveShadow>
        <planeGeometry args={[6, 46]} />
        <meshStandardMaterial color="#262320" roughness={0.92} metalness={0.03} />
      </mesh>
      {/* Street lamps: emissive only. A lamp beyond the glazing must not spend a
          real light from the interior budget. */}
      {[-16, -6, 4, 14].map((z) => (
        <group key={z} position={[19.4, 0, z]}>
          <mesh position={[0, 2.4, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 4.8, 8]} />
            <meshStandardMaterial color="#1a1917" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[0, 4.9, 0]}>
            <sphereGeometry args={[0.22, 12, 10]} />
            <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <StreetTrees />
    </group>
  );
}

/**
 * Street trees.
 *
 * An empty plaza in front of a restaurant reads as a diorama on a table. Four
 * trees along the kerb give the exterior a scale reference, a horizon line and a
 * reason for the building to be where it is — and they are two instanced meshes,
 * not sixteen draw calls.
 */
function StreetTrees() {
  // Along the terrace edge and down the far side of the street — never across
  // the establishing sight line, which looks in from the south-east.
  const positions = useMemo(
    () => [
      [-21.5, 13.4],
      [-17.4, 14.2],
      [-13.2, 13.6],
      [-9.0, 14.3],
      [18.2, -13.5],
      [18.6, -6.8],
      [19.0, 0.4],
    ] as Array<[number, number]>,
    [],
  );
  const trunks = useRef<THREE.InstancedMesh>(null);
  const canopies = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    positions.forEach(([x, z], index) => {
      const height = 3.1 + ((index * 5) % 3) * 0.3;
      matrix.compose(new THREE.Vector3(x, height / 2, z), quaternion, new THREE.Vector3(1, height, 1));
      trunks.current?.setMatrixAt(index, matrix);
      const scale = 1.35 + ((index * 3) % 4) * 0.12;
      matrix.compose(new THREE.Vector3(x, height + scale * 0.55, z), quaternion, new THREE.Vector3(scale, scale * 1.05, scale));
      canopies.current?.setMatrixAt(index, matrix);
    });
    if (trunks.current) {
      trunks.current.instanceMatrix.needsUpdate = true;
      trunks.current.computeBoundingSphere();
    }
    if (canopies.current) {
      canopies.current.instanceMatrix.needsUpdate = true;
      canopies.current.computeBoundingSphere();
    }
  }, [positions]);

  return (
    <group name="street-trees">
      <instancedMesh ref={trunks} args={[undefined, undefined, positions.length]} castShadow>
        <cylinderGeometry args={[0.13, 0.19, 1, 7]} />
        <meshStandardMaterial color="#2e2318" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopies} args={[undefined, undefined, positions.length]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#3a5137" roughness={0.95} flatShading />
      </instancedMesh>
    </group>
  );
}

/** Low-detail city across the street, seen through the east glazing. */
export function CityBackdrop() {
  const blocks = useMemo(() => {
    let seed = 20261022;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    return Array.from({ length: 26 }).map((_, i) => {
      const z = -34 + i * 2.8 + random() * 1.2;
      return {
        x: 21 + random() * 16,
        z,
        w: 3 + random() * 4,
        d: 3 + random() * 5,
        h: 5 + random() * 14,
      };
    });
  }, []);

  const windows = useMemo(() => {
    let seed = 99173;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    return blocks.flatMap((block) =>
      Array.from({ length: 7 }).map(() => ({
        x: block.x - block.w / 2 - 0.02,
        y: 1.5 + random() * (block.h - 2),
        z: block.z + (random() - 0.5) * block.d,
        s: 0.16 + random() * 0.22,
        warm: random() > 0.3,
      })),
    );
  }, [blocks]);

  const instanced = useRef<THREE.InstancedMesh>(null);
  const litMat = useRef<THREE.MeshBasicMaterial>(null);

  useLayoutEffect(() => {
    const mesh = instanced.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
    const color = new THREE.Color();
    windows.forEach((win, index) => {
      matrix.compose(new THREE.Vector3(win.x, win.y, win.z), quaternion, new THREE.Vector3(win.s, win.s * 1.5, 1));
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(win.warm ? "#ffcf94" : "#cfe0ea"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [windows]);

  return (
    <group name="city">
      {blocks.map((block, i) => (
        <mesh key={i} position={[block.x, block.h / 2 - 0.3, block.z]}>
          <boxGeometry args={[block.w, block.h, block.d]} />
          <meshStandardMaterial color="#0e1116" roughness={0.9} metalness={0.05} />
        </mesh>
      ))}
      <instancedMesh ref={instanced} args={[undefined, undefined, windows.length]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={litMat}
          color="#ffffff"
          transparent
          opacity={0.55}
          toneMapped={false}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}
