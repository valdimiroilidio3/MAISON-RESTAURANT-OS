"use client";

/**
 * A stylised but carefully built human figure for the live simulation.
 *
 * It is deliberately made of primitives (no external GLTF assets are available
 * offline) yet aims for believable proportions, joints, clothing, hair, hands
 * and posture: the figure stands, walks, sits at the table, eats, drinks, reads
 * the menu, talks, pays and carries a tray. It is **not** photoreal and the UI
 * labels it as a stylised 3D figure.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SimActor } from "@/lib/simulation/types";

const SKIN_TONES = ["#e7bb95", "#dcab80", "#cf9a6c", "#bc8457", "#a26b44", "#845335", "#6b412a"];
const HAIR_TONES = ["#181310", "#241a12", "#33241a", "#4a2f1e", "#6b4a2c", "#8b8178", "#2a2523"];
const SHIRT_TONES = ["#2d2923", "#3d4b46", "#5a3b34", "#33414f", "#6a6154", "#7a6b57", "#263b35", "#4b3f52"];
const TROUSER_TONES = ["#1c1a18", "#26231f", "#2f363d", "#3a332b", "#22262b"];
const STAFF_SHIRT = "#15120f";
const APRON = "#c9beac";

/* Shared geometry — one buffer per part for every actor on the floor. */
const G = {
  skull: new THREE.SphereGeometry(0.105, 24, 18),
  jaw: new THREE.SphereGeometry(0.085, 18, 14),
  nose: new THREE.ConeGeometry(0.017, 0.038, 8),
  ear: new THREE.SphereGeometry(0.02, 10, 8),
  eyeWhite: new THREE.SphereGeometry(0.016, 12, 10),
  pupil: new THREE.SphereGeometry(0.008, 10, 8),
  brow: new THREE.BoxGeometry(0.032, 0.006, 0.008),
  mouth: new THREE.BoxGeometry(0.034, 0.006, 0.008),
  hairCap: new THREE.SphereGeometry(0.111, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
  neck: new THREE.CylinderGeometry(0.041, 0.046, 0.075, 12),
  torso: new THREE.CylinderGeometry(0.175, 0.142, 0.44, 18, 4),
  chest: new THREE.SphereGeometry(0.172, 18, 14),
  pelvis: new THREE.CylinderGeometry(0.145, 0.135, 0.17, 14),
  shoulder: new THREE.SphereGeometry(0.062, 14, 12),
  upperArm: new THREE.CapsuleGeometry(0.048, 0.19, 6, 12),
  foreArm: new THREE.CapsuleGeometry(0.041, 0.17, 6, 12),
  hand: new THREE.BoxGeometry(0.052, 0.085, 0.024),
  finger: new THREE.CapsuleGeometry(0.0065, 0.042, 4, 6),
  thumb: new THREE.CapsuleGeometry(0.008, 0.03, 4, 6),
  thigh: new THREE.CapsuleGeometry(0.075, 0.29, 6, 12),
  shin: new THREE.CapsuleGeometry(0.058, 0.29, 6, 12),
  foot: new THREE.BoxGeometry(0.085, 0.07, 0.21),
  collar: new THREE.TorusGeometry(0.055, 0.012, 8, 18),
  button: new THREE.SphereGeometry(0.008, 8, 6),
  apron: new THREE.BoxGeometry(0.3, 0.44, 0.02),
  badge: new THREE.BoxGeometry(0.06, 0.02, 0.005),
  glass: new THREE.CylinderGeometry(0.032, 0.026, 0.1, 14, 1, true),
  glassBase: new THREE.CylinderGeometry(0.03, 0.03, 0.006, 14),
  tray: new THREE.CylinderGeometry(0.19, 0.19, 0.014, 22),
  plate: new THREE.CylinderGeometry(0.115, 0.1, 0.012, 26),
  plateRim: new THREE.TorusGeometry(0.108, 0.006, 6, 26),
  food: new THREE.SphereGeometry(0.05, 12, 10),
  terminal: new THREE.BoxGeometry(0.075, 0.135, 0.018),
  menu: new THREE.BoxGeometry(0.14, 0.2, 0.008),
  fork: new THREE.BoxGeometry(0.012, 0.11, 0.004),
  knife: new THREE.BoxGeometry(0.012, 0.12, 0.004),
  card: new THREE.BoxGeometry(0.055, 0.034, 0.003),
};

type Vec3 = [number, number, number];

export interface ActorProps {
  actor: SimActor;
  /** Restaurant clock, 0..1 daylight, used to tint skin/clothing in the dark. */
  dayLight: number;
  reducedMotion: boolean;
}

export function Actor({ actor, reducedMotion }: ActorProps) {
  const palette = useMemo(() => {
    const seed = actor.seed;
    const pick = <T,>(list: T[], offset: number) => list[Math.abs(seed + offset) % list.length];
    const staff = actor.kind === "waiter" || actor.kind === "runner" || actor.kind === "host" || actor.kind === "chef";
    return {
      skin: pick(SKIN_TONES, 0),
      hair: pick(HAIR_TONES, 3),
      shirt: staff ? STAFF_SHIRT : pick(SHIRT_TONES, 5),
      trousers: staff ? "#191715" : pick(TROUSER_TONES, 7),
      shoes: "#151210",
      apron: staff && actor.kind !== "chef",
      glasses: !staff && seed % 7 === 0,
      longHair: staff ? (seed % 3 === 0) : seed % 4 === 0,
      height: 0.97 + ((seed % 9) / 9) * 0.06,
    };
  }, [actor.seed, actor.kind]);

  const mats = useMemo(() => {
    const standard = (color: string, roughness = 0.72, metalness = 0.02) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    return {
      skin: standard(palette.skin, 0.62),
      hair: standard(palette.hair, 0.88),
      shirt: standard(palette.shirt, 0.86),
      trousers: standard(palette.trousers, 0.8),
      shoes: standard(palette.shoes, 0.5, 0.15),
      apron: standard(APRON, 0.9),
      white: standard("#f3efe6", 0.5),
      dark: standard("#161310", 0.6),
      metal: new THREE.MeshStandardMaterial({ color: "#c9c4b8", roughness: 0.28, metalness: 0.8 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: "#d9e6e2",
        transmission: 0.9,
        thickness: 0.2,
        roughness: 0.08,
        transparent: true,
        opacity: 0.35,
      }),
      terminal: standard("#1f2325", 0.45, 0.2),
      screen: new THREE.MeshBasicMaterial({ color: "#9fd8c4" }),
    };
  }, [palette]);

  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const foreL = useRef<THREE.Group>(null);
  const foreR = useRef<THREE.Group>(null);
  const thighL = useRef<THREE.Group>(null);
  const thighR = useRef<THREE.Group>(null);
  const shinL = useRef<THREE.Group>(null);
  const shinR = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Group>(null);
  const eyeR = useRef<THREE.Group>(null);
  const trayRef = useRef<THREE.Group>(null);
  const plateRef = useRef<THREE.Group>(null);
  const foodRef = useRef<THREE.Mesh>(null);
  const foodMat = useRef<THREE.MeshStandardMaterial>(null);
  const glassRef = useRef<THREE.Group>(null);
  const liquidRef = useRef<THREE.Mesh>(null);
  const cutleryRef = useRef<THREE.Group>(null);
  const menuRef = useRef<THREE.Group>(null);
  const terminalRef = useRef<THREE.Group>(null);
  const blink = useRef(0);

  useFrame((state, delta) => {
    const dt = Math.min(0.05, delta);
    const t = state.clock.elapsedTime + actor.seed * 0.37;
    const pose = actor.pose;
    const moving = pose === "walk";
    const seated = pose === "sit" || pose === "eat" || pose === "drink" || pose === "read" || pose === "talk" || pose === "pay";
    const smoothing = reducedMotion ? 1 : Math.min(1, dt * 9);

    if (root.current) {
      root.current.position.set(actor.x, 0, actor.z);
      root.current.rotation.y = actor.rotation;
      root.current.visible = !actor.hidden;
      const scale = palette.height;
      if (Math.abs(root.current.scale.x - scale) > 0.001) root.current.scale.setScalar(scale);
    }

    const hipTarget = seated ? 0.47 : 0.935 + (moving ? Math.abs(Math.sin(t * 6.2)) * 0.012 : Math.sin(t * 1.2) * 0.004);
    if (hips.current) hips.current.position.y += (hipTarget - hips.current.position.y) * smoothing;

    const breath = Math.sin(t * 1.6) * 0.008;
    if (torso.current) {
      const lean = pose === "clear" ? 0.35 : pose === "eat" || pose === "read" ? 0.12 : pose === "cook" ? 0.16 : 0.02;
      torso.current.rotation.x += (lean - torso.current.rotation.x) * smoothing;
      torso.current.rotation.z = Math.sin(t * 0.7) * 0.012;
      torso.current.position.y = 0.14 + breath * 0.4;
    }

    if (head.current) {
      let yaw = Math.sin(t * 0.45) * 0.16;
      let pitch = Math.sin(t * 0.33) * 0.04;
      if (pose === "talk") yaw = Math.sin(t * 0.9) * 0.34;
      if (pose === "read") pitch = 0.24;
      if (pose === "eat") pitch = 0.1 + Math.sin(t * 2.2) * 0.03;
      if (pose === "drink") pitch = -0.08;
      head.current.rotation.y += (yaw - head.current.rotation.y) * smoothing;
      head.current.rotation.x += (pitch - head.current.rotation.x) * smoothing;
    }

    // Blink: a short scale pulse of the eyelids every few seconds.
    blink.current += dt;
    const blinking = blink.current % 4.3 > 4.12;
    for (const eye of [eyeL.current, eyeR.current]) {
      if (eye) eye.scale.y = blinking ? 0.12 : 1;
    }

    const walk = moving ? Math.sin(t * 7.4) : 0;
    const armRest = 0.06 + Math.sin(t * 1.4) * 0.015;
    let armLX = armRest;
    let armRX = armRest;
    let foreLX = -0.18;
    let foreRX = -0.18;
    let armLZ = 0.16;
    let armRZ = -0.16;

    if (moving) {
      armLX = -walk * 0.55;
      armRX = walk * 0.55;
      foreLX = -0.25 - Math.max(0, walk) * 0.2;
      foreRX = -0.25 - Math.max(0, -walk) * 0.2;
    } else if (seated) {
      armLX = -0.55;
      armRX = -0.55;
      foreLX = -0.85;
      foreRX = -0.85;
      armLZ = 0.07;
      armRZ = -0.07;
    }

    if (pose === "read") {
      armLX = -0.85;
      armRX = -0.85;
      foreLX = -1.25;
      foreRX = -1.25;
    }
    if (pose === "talk") {
      armRX = -0.45 + Math.sin(t * 1.3) * 0.22;
      foreRX = -0.9 + Math.sin(t * 1.1) * 0.25;
    }
    if (pose === "drink") {
      armRX = -0.85;
      foreRX = -1.5 + Math.sin(t * 1.2) * 0.1;
    }
    if (pose === "eat") {
      armRX = -0.7;
      foreRX = -1.15 + Math.sin(t * 2.1) * 0.22;
      armLX = -0.35;
      foreLX = -0.55;
    }
    if (pose === "pay") {
      armRX = -0.95;
      foreRX = -0.55;
      armLX = -0.2;
    }
    if (pose === "carry") {
      armLX = -1.05;
      armRX = -1.05;
      foreLX = -0.55;
      foreRX = -0.55;
      armLZ = 0.1;
      armRZ = -0.1;
    }
    if (pose === "serve" || pose === "clear") {
      armLX = -0.95;
      armRX = -0.95;
      foreLX = -0.6;
      foreRX = -0.6;
    }
    if (pose === "cook") {
      armLX = -0.75 + Math.sin(t * 2.4) * 0.12;
      armRX = -0.95 + Math.cos(t * 2.1) * 0.12;
      foreLX = -0.55;
      foreRX = -0.7;
    }

    if (armL.current) {
      armL.current.rotation.x += (armLX - armL.current.rotation.x) * smoothing;
      armL.current.rotation.z += (armLZ - armL.current.rotation.z) * smoothing;
    }
    if (armR.current) {
      armR.current.rotation.x += (armRX - armR.current.rotation.x) * smoothing;
      armR.current.rotation.z += (armRZ - armR.current.rotation.z) * smoothing;
    }
    if (foreL.current) foreL.current.rotation.x += (foreLX - foreL.current.rotation.x) * smoothing;
    if (foreR.current) foreR.current.rotation.x += (foreRX - foreR.current.rotation.x) * smoothing;

    // Legs
    const thighTarget = seated ? -Math.PI / 2 + 0.06 : moving ? walk * 0.5 : 0;
    const thighTargetR = seated ? -Math.PI / 2 + 0.06 : moving ? -walk * 0.5 : 0;
    const shinTarget = seated ? Math.PI / 2 - 0.06 : moving ? Math.max(0, -walk) * 0.55 : 0.02;
    const shinTargetR = seated ? Math.PI / 2 - 0.06 : moving ? Math.max(0, walk) * 0.55 : 0.02;
    if (thighL.current) thighL.current.rotation.x += (thighTarget - thighL.current.rotation.x) * smoothing;
    if (thighR.current) thighR.current.rotation.x += (thighTargetR - thighR.current.rotation.x) * smoothing;
    if (shinL.current) shinL.current.rotation.x += (shinTarget - shinL.current.rotation.x) * smoothing;
    if (shinR.current) shinR.current.rotation.x += (shinTargetR - shinR.current.rotation.x) * smoothing;

    if (trayRef.current) trayRef.current.visible = actor.carrying === "tray";
    if (terminalRef.current) terminalRef.current.visible = actor.carrying === "terminal";
    if (menuRef.current) menuRef.current.visible = pose === "read";
    if (plateRef.current) plateRef.current.visible = !!actor.plate;
    if (glassRef.current) glassRef.current.visible = actor.glass > 0.05;
    if (cutleryRef.current) cutleryRef.current.visible = !!actor.plate;
    if (foodRef.current && actor.plate) {
      const fill = Math.max(0.12, actor.plate.fill);
      foodRef.current.scale.setScalar(fill);
    }
    if (foodMat.current && actor.plate) {
      const course = actor.plate.course;
      foodMat.current.color.set(course === "dessert" ? "#e8cfae" : course === "entry" ? "#8fae72" : "#b07a4a");
    }
    if (liquidRef.current && actor.glass > 0.05) {
      liquidRef.current.scale.y = Math.max(0.08, actor.glass);
      liquidRef.current.position.y = -0.03 + actor.glass * 0.02;
    }
  });

  const thighY = -0.06;
  const shinY = -0.36;

  return (
    <group ref={root} name={`actor-${actor.id}`} position={[actor.x, 0, actor.z]} rotation={[0, actor.rotation, 0]}>
      <group ref={hips} position={[0, 0.935, 0]}>
        <mesh geometry={G.pelvis} material={mats.trousers} castShadow />

        {/* torso and clothing */}
        <group ref={torso} position={[0, 0.14, 0]}>
          <mesh geometry={G.torso} material={mats.shirt} position={[0, 0.22, 0]} scale={[1, 1, 0.72]} castShadow />
          <mesh geometry={G.chest} material={mats.shirt} position={[0, 0.42, 0]} scale={[1, 0.62, 0.66]} />
          <mesh geometry={G.collar} material={mats.shirt} position={[0, 0.47, 0.005]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.75, 1]} />
          {[0.18, 0.29, 0.4].map((y) => (
            <mesh key={y} geometry={G.button} material={mats.dark} position={[0, y, 0.135]} />
          ))}
          {palette.apron && (
            <>
              <mesh geometry={G.apron} material={mats.apron} position={[0, 0.08, 0.125]} />
              <mesh geometry={G.badge} material={mats.metal} position={[0.1, 0.34, 0.14]} />
            </>
          )}

          <mesh geometry={G.neck} material={mats.skin} position={[0, 0.5, 0]} />

          <group ref={head} position={[0, 0.575, 0]}>
            <mesh geometry={G.skull} material={mats.skin} scale={[1, 1.1, 1.02]} castShadow />
            <mesh geometry={G.jaw} material={mats.skin} position={[0, -0.058, 0.018]} scale={[1, 0.78, 1]} />
            <mesh geometry={G.nose} material={mats.skin} position={[0, -0.012, 0.104]} rotation={[Math.PI / 2, 0, 0]} />
            <mesh geometry={G.ear} material={mats.skin} position={[0.101, 0, 0]} scale={[0.7, 1.4, 1]} />
            <mesh geometry={G.ear} material={mats.skin} position={[-0.101, 0, 0]} scale={[0.7, 1.4, 1]} />
            <group ref={eyeL} position={[0.037, 0.014, 0.092]}>
              <mesh geometry={G.eyeWhite} material={mats.white} scale={[1, 0.9, 0.6]} />
              <mesh geometry={G.pupil} material={mats.dark} position={[0, 0, 0.012]} />
            </group>
            <group ref={eyeR} position={[-0.037, 0.014, 0.092]}>
              <mesh geometry={G.eyeWhite} material={mats.white} scale={[1, 0.9, 0.6]} />
              <mesh geometry={G.pupil} material={mats.dark} position={[0, 0, 0.012]} />
            </group>
            <mesh geometry={G.brow} material={mats.hair} position={[0.037, 0.042, 0.1]} rotation={[0, 0, -0.12]} />
            <mesh geometry={G.brow} material={mats.hair} position={[-0.037, 0.042, 0.1]} rotation={[0, 0, 0.12]} />
            <mesh geometry={G.mouth} material={mats.dark} position={[0, -0.062, 0.097]} />
            <mesh geometry={G.hairCap} material={mats.hair} position={[0, 0.012, -0.008]} rotation={[-0.22, 0, 0]} scale={[1.02, 1.06, 1.04]} />
            {palette.longHair && (
              <mesh geometry={G.hairCap} material={mats.hair} position={[0, -0.06, -0.055]} rotation={[0.5, 0, 0]} scale={[1.02, 1.25, 0.9]} />
            )}
            {palette.glasses && (
              <group position={[0, 0.02, 0.108]}>
                <mesh geometry={G.brow} material={mats.metal} position={[0.037, 0, 0]} scale={[1.5, 0.8, 0.5]} />
                <mesh geometry={G.brow} material={mats.metal} position={[-0.037, 0, 0]} scale={[1.5, 0.8, 0.5]} />
                <mesh geometry={G.brow} material={mats.metal} position={[0, 0, 0]} scale={[0.7, 0.4, 0.4]} />
              </group>
            )}
          </group>

          {/* arms */}
          <group ref={armL} position={[0.205, 0.43, 0]} rotation={[0.06, 0, 0.16]}>
            <mesh geometry={G.shoulder} material={mats.shirt} scale={[1, 0.9, 0.9]} />
            <mesh geometry={G.upperArm} material={mats.shirt} position={[0, -0.14, 0]} castShadow />
            <group ref={foreL} position={[0, -0.29, 0]}>
              <mesh geometry={G.shoulder} material={mats.skin} scale={[0.62, 0.62, 0.62]} />
              <mesh geometry={G.foreArm} material={mats.skin} position={[0, -0.1, 0]} />
              <Hand mats={mats} />
            </group>
          </group>
          <group ref={armR} position={[-0.205, 0.43, 0]} rotation={[0.06, 0, -0.16]}>
            <mesh geometry={G.shoulder} material={mats.shirt} scale={[1, 0.9, 0.9]} />
            <mesh geometry={G.upperArm} material={mats.shirt} position={[0, -0.14, 0]} castShadow />
            <group ref={foreR} position={[0, -0.29, 0]}>
              <mesh geometry={G.shoulder} material={mats.skin} scale={[0.7, 0.7, 0.7]} />
              <mesh geometry={G.foreArm} material={mats.skin} position={[0, -0.1, 0]} />
              <Hand mats={mats} />
              <group ref={menuRef} position={[0, -0.3, 0.12]} rotation={[-0.5, 0, 0]} visible={false}>
                <mesh geometry={G.menu} material={mats.white} />
                <mesh geometry={G.menu} material={mats.dark} position={[0, 0, 0.005]} scale={[0.92, 0.92, 1]} />
              </group>
              <group ref={terminalRef} position={[0, -0.3, 0.1]} rotation={[-0.9, 0, 0]} visible={false}>
                <mesh geometry={G.terminal} material={mats.terminal} />
                <mesh position={[0, 0.03, 0.011]}>
                  <planeGeometry args={[0.055, 0.045]} />
                  <meshBasicMaterial color="#9fd8c4" />
                </mesh>
              </group>
              <group ref={trayRef} position={[0, -0.34, 0.14]} visible={false}>
                <mesh geometry={G.tray} material={mats.metal} rotation={[0.06, 0, 0]} />
                <mesh geometry={G.plate} material={mats.white} position={[0, 0.02, 0]} />
                <mesh geometry={G.plate} material={mats.white} position={[0.08, 0.02, 0.06]} scale={0.85} />
                <mesh geometry={G.glass} material={mats.glass} position={[-0.09, 0.08, -0.02]} />
              </group>
            </group>
          </group>
        </group>

        {/* legs */}
        <group ref={thighL} position={[0.085, thighY, 0]}>
          <mesh geometry={G.thigh} material={mats.trousers} position={[0, -0.18, 0]} castShadow />
          <group ref={shinL} position={[0, shinY, 0]}>
            <mesh geometry={G.shoulder} material={mats.trousers} scale={[0.8, 0.8, 0.8]} />
            <mesh geometry={G.shin} material={mats.trousers} position={[0, -0.17, 0]} />
            <mesh geometry={G.foot} material={mats.shoes} position={[0, -0.36, 0.05]} />
          </group>
        </group>
        <group ref={thighR} position={[-0.085, thighY, 0]}>
          <mesh geometry={G.thigh} material={mats.trousers} position={[0, -0.18, 0]} castShadow />
          <group ref={shinR} position={[0, shinY, 0]}>
            <mesh geometry={G.shoulder} material={mats.trousers} scale={[0.8, 0.8, 0.8]} />
            <mesh geometry={G.shin} material={mats.trousers} position={[0, -0.17, 0]} />
            <mesh geometry={G.foot} material={mats.shoes} position={[0, -0.36, 0.05]} />
          </group>
        </group>
      </group>

        {/* ------- tabletop props (plates, glass, cutlery, menu, terminal) ------- */}
        <group ref={plateRef} position={[0.02, 0.762, 0.6]} visible={false}>
          <mesh geometry={G.plate} material={mats.white} />
          <mesh geometry={G.plateRim} material={mats.white} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} scale={0.92} />
          <mesh ref={foodRef} geometry={G.food} position={[0, 0.035, 0]} scale={[1, 0.45, 1]}>
            <meshStandardMaterial ref={foodMat} color="#b07a4a" roughness={0.65} />
          </mesh>
        </group>
        <group ref={glassRef} position={[-0.24, 0.79, 0.52]} visible={false}>
          <mesh>
            <cylinderGeometry args={[0.038, 0.03, 0.085, 14, 1, true]} />
            <meshStandardMaterial color="#dfece8" transparent opacity={0.26} roughness={0.05} metalness={0.1} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh ref={liquidRef}>
            <cylinderGeometry args={[0.032, 0.027, 0.05, 12]} />
            <meshStandardMaterial color="#7d2a33" roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.062, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.05, 6]} />
            <meshStandardMaterial color="#cfd8d4" transparent opacity={0.5} />
          </mesh>
          <mesh position={[0, -0.09, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.006, 14]} />
            <meshStandardMaterial color="#cfd8d4" transparent opacity={0.5} />
          </mesh>
        </group>
        <group ref={cutleryRef} position={[0.22, 0.762, 0.58]} rotation={[0, 0.12, 0]} visible={false}>
          <mesh geometry={G.fork} material={mats.metal} position={[0, 0, 0]} />
          <mesh geometry={G.knife} material={mats.metal} position={[0.16, 0, 0.02]} />
        </group>

    </group>
  );
}

function Hand({ mats }: { mats: Record<string, THREE.Material> }) {
  return (
    <group position={[0, -0.275, 0]} rotation={[0.12, 0, 0]}>
      <mesh geometry={G.hand} material={mats.skin} />
      {[-0.016, -0.005, 0.006, 0.017].map((x, i) => (
        <mesh
          key={i}
          geometry={G.finger}
          material={mats.skin}
          position={[x, -0.052, 0.004]}
          rotation={[0.5, 0, 0]}
        />
      ))}
      <mesh geometry={G.thumb} material={mats.skin} position={[0.031, -0.014, 0.012]} rotation={[0.3, 0, 1.1]} />
    </group>
  );
}
