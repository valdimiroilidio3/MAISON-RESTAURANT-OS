"use client";

/**
 * Camera transition and the render probe.
 *
 * The rig only moves when a pose is requested: it lerps eye and target with a
 * frame-rate-independent factor, then hands control back to OrbitControls. It is
 * shared by the floor view and the simulation so both feel identical.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { CAMERA, OVERVIEW_FIT, ROOM_BOX, fitPose, type CameraPose } from "@/lib/scene/framing";

export function CameraRig({
  pose,
  controls,
}: {
  pose: CameraPose | null;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const desired = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!pose) return;
    desired.current = {
      position: new THREE.Vector3(...pose.position),
      target: new THREE.Vector3(...pose.target),
    };
  }, [pose]);

  useFrame((_, delta) => {
    const goal = desired.current;
    if (!goal || !controls.current) return;
    const factor = 1 - Math.pow(0.0015, Math.min(delta, 0.1));
    camera.position.lerp(goal.position, factor);
    controls.current.target.lerp(goal.target, factor);
    controls.current.update();
    if (camera.position.distanceTo(goal.position) < 0.04) desired.current = null;
  });

  return null;
}

export interface RenderStats {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  fps: number;
}

declare global {
  interface Window {
    __MAISON_3D__?: RenderStats;
  }
}

/**
 * Publishes real renderer counters to `window.__MAISON_3D__` when the page is
 * opened with `?debug3d=1` (or `#debug3d`). This is how the performance numbers
 * in the report are obtained — they are never estimated.
 */
export interface SceneEntry {
  name: string;
  geometry: string;
  material: string;
  transparent: boolean;
  opacity: number;
  /** World-space position, rounded to 2 decimals. */
  position: [number, number, number];
  /** Largest world-space dimension of the geometry. */
  size: number;
}

interface SceneSnapshot {
  meshes: number;
  instanced: number;
  lights: number;
  /**
   * Every transparent or emissive mesh in the scene, with its world position and
   * size. This is the inventory the spatial audit uses to find stray geometry
   * (a halo left in mid-air, a blob shadow on the wrong plane): the render
   * counters say how much is drawn, this says *what*.
   */
  inventory: SceneEntry[];
  spheres: Array<{ parent: string; radius: number; visible: boolean; opacity: number; side: number; color: string; order: number }>;
  camera: { position: number[]; far: number };
  fog: { near: number; far: number; color: string } | null;
}

declare global {
  interface Window {
    __MAISON_SCENE__?: SceneSnapshot;
    __MAISON_PICK__?: (
      clientX: number,
      clientY: number,
    ) => Array<{ name: string; geometry: string; material: string; distance: number; point: number[] }>;
  }
}

export function RenderProbe({ enabled }: { enabled: boolean }) {
  const { gl, scene, camera } = useThree();

  // A screen-space picker for the audit: "what is that object?" answered by
  // raycasting instead of guessing from a screenshot. Coordinates are CSS pixels
  // relative to the canvas, so a probe report can name the exact mesh.
  useEffect(() => {
    if (!enabled) return;
    window.__MAISON_PICK__ = (clientX: number, clientY: number) => {
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true).slice(0, 4);
      return hits.map((hit) => {
        const mesh = hit.object as THREE.Mesh;
        const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material | undefined;
        return {
          name: mesh.name || mesh.parent?.name || "",
          geometry: mesh.geometry?.type ?? "",
          material: material?.type ?? "",
          distance: Math.round(hit.distance * 100) / 100,
          point: hit.point.toArray().map((value) => Math.round(value * 100) / 100),
        };
      });
    };
    return () => {
      delete window.__MAISON_PICK__;
    };
  }, [enabled, gl, scene, camera]);
  const frames = useRef(0);
  const elapsed = useRef(0);
  const fps = useRef(0);

  useFrame((_, delta) => {
    frames.current += 1;
    elapsed.current += delta;
    if (elapsed.current >= 1) {
      fps.current = Math.round(frames.current / elapsed.current);
      frames.current = 0;
      elapsed.current = 0;
    }
    if (!enabled) return;
    if (frames.current === 0) {
      const spheres: SceneSnapshot["spheres"] = [];
      const inventory: SceneEntry[] = [];
      const box = new THREE.Box3();
      const world = new THREE.Vector3();
      let meshes = 0;
      let instanced = 0;
      let lights = 0;
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) meshes += 1;
        if ((object as THREE.InstancedMesh).isInstancedMesh) instanced += 1;
        if ((object as THREE.Light).isLight) lights += 1;
        if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) {
          const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
          const emissive = material?.emissive && material.emissive.getHex() !== 0;
          if (material && (material.transparent || emissive) && inventory.length < 120 && mesh.geometry) {
            mesh.getWorldPosition(world);
            mesh.geometry.computeBoundingBox();
            box.copy(mesh.geometry.boundingBox!);
            const size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) * Math.max(
              mesh.scale.x,
              mesh.scale.y,
              mesh.scale.z,
            );
            inventory.push({
              name: mesh.name || mesh.parent?.name || "",
              geometry: mesh.geometry.type,
              material: material.type,
              transparent: material.transparent,
              opacity: material.opacity ?? 1,
              position: [Math.round(world.x * 100) / 100, Math.round(world.y * 100) / 100, Math.round(world.z * 100) / 100],
              size: Math.round(size * 100) / 100,
            });
          }
        }
        if (mesh.isMesh && mesh.geometry?.type === "SphereGeometry") {
          const parameters = (mesh.geometry as THREE.SphereGeometry).parameters;
          const material = mesh.material as THREE.MeshBasicMaterial;
          spheres.push({
            parent: mesh.parent?.name ?? "",
            radius: parameters.radius,
            visible: mesh.visible && (mesh.parent?.visible ?? true),
            opacity: material.opacity ?? 1,
            side: material.side,
            color: material.color?.getHexString?.() ?? "",
            order: mesh.renderOrder,
          });
        }
      });
      window.__MAISON_SCENE__ = {
        meshes,
        instanced,
        lights,
        inventory,
        spheres,
        camera: { position: camera.position.toArray(), far: (camera as THREE.PerspectiveCamera).far },
        fog:
          scene.fog && "near" in scene.fog
            ? { near: scene.fog.near, far: scene.fog.far, color: scene.fog.color.getHexString() }
            : null,
      };
    }
    const info = gl.info;
    window.__MAISON_3D__ = {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      fps: fps.current,
    };
  });

  return null;
}

/**
 * Responsive framing.
 *
 * When a pose is explicitly requested (a `?view=` preset or a table focus) it is
 * used as-is: the preset is the point, and pushing it back on a phone would
 * defeat it. Otherwise the establishing view is re-fitted to the real canvas
 * aspect, so the terrace never falls off the edge of a portrait screen.
 */
export function FitCamera({ pose }: { pose?: CameraPose }) {
  const { camera, size } = useThree();
  const width = size.width;
  const height = size.height;
  useEffect(() => {
    if (!camera) return;
    const aspect = Math.max(0.4, width / Math.max(1, height));
    const base = pose ?? fitPose(ROOM_BOX, aspect, OVERVIEW_FIT);
    camera.position.set(...base.position);
    camera.lookAt(...base.target);
    const perspective = camera as THREE.PerspectiveCamera;
    if (base.fov && perspective.isPerspectiveCamera) {
      perspective.fov = base.fov;
      perspective.updateProjectionMatrix();
    }
  }, [camera, width, height, pose]);
  return null;
}

export function debugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debug3d") === "1" || window.location.hash === "#debug3d";
}
