"use client";

/**
 * A cast member of the live service.
 *
 * This file owns the *props* a person carries — tray, menu, card terminal, the
 * plate and glass on the table in front of them — and the per-frame sync of those
 * props with the engine. The body itself is `HumanCharacter`, which owns the rig
 * and the animation; the split keeps this file about service state and keeps the
 * anatomy reusable.
 *
 * The figures are stylised three-dimensional people, not photographs: the UI says
 * so, and nothing here claims otherwise.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SimActor } from "@/lib/simulation/types";
import { TABLE_HEIGHT } from "@/lib/floor-geometry";
import { HumanCharacter } from "./HumanCharacter";

/** Props only. The body's geometry lives in `lib/characters/body.ts`. */
const G = {
  glass: new THREE.CylinderGeometry(0.032, 0.026, 0.1, 14, 1, true),
  tray: new THREE.CylinderGeometry(0.19, 0.19, 0.012, 24),
  plate: new THREE.CylinderGeometry(0.115, 0.1, 0.012, 26),
  plateRim: new THREE.TorusGeometry(0.108, 0.005, 6, 26),
  food: new THREE.SphereGeometry(0.05, 12, 10),
  terminal: new THREE.BoxGeometry(0.075, 0.13, 0.018),
  menu: new THREE.BoxGeometry(0.13, 0.19, 0.007),
  fork: new THREE.BoxGeometry(0.012, 0.17, 0.005),
  knife: new THREE.BoxGeometry(0.014, 0.18, 0.005),
};

const PROPS = {
  china: new THREE.MeshStandardMaterial({ color: "#f2eee6", roughness: 0.28, metalness: 0 }),
  metal: new THREE.MeshStandardMaterial({ color: "#b9b3a8", roughness: 0.32, metalness: 0.8 }),
  paper: new THREE.MeshStandardMaterial({ color: "#efe9dc", roughness: 0.86 }),
  ink: new THREE.MeshStandardMaterial({ color: "#26221d", roughness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({
    color: "#dfece8",
    transparent: true,
    opacity: 0.22,
    roughness: 0.06,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  wine: new THREE.MeshStandardMaterial({ color: "#7d2a33", roughness: 0.24 }),
  terminal: new THREE.MeshStandardMaterial({ color: "#1d1f22", roughness: 0.5, metalness: 0.2 }),
  screen: new THREE.MeshBasicMaterial({ color: "#9fd8c4", toneMapped: false }),
};

export interface ActorProps {
  actor: SimActor;
  dayLight?: number;
  reducedMotion: boolean;
}

export function Actor({ actor, reducedMotion }: ActorProps) {
  const tray = useRef<THREE.Group>(null);
  const menu = useRef<THREE.Group>(null);
  const terminal = useRef<THREE.Group>(null);
  const plate = useRef<THREE.Group>(null);
  const glass = useRef<THREE.Group>(null);
  const cutlery = useRef<THREE.Group>(null);
  const food = useRef<THREE.Mesh>(null);
  const foodMat = useRef<THREE.MeshStandardMaterial>(null);
  const liquid = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (tray.current) tray.current.visible = actor.carrying === "tray";
    if (terminal.current) terminal.current.visible = actor.carrying === "terminal";
    if (menu.current) menu.current.visible = actor.pose === "read";
    if (plate.current) plate.current.visible = !!actor.plate;
    if (glass.current) glass.current.visible = actor.glass > 0.05;
    if (cutlery.current) cutlery.current.visible = !!actor.plate;
    if (food.current && actor.plate) food.current.scale.setScalar(Math.max(0.12, actor.plate.fill));
    if (foodMat.current && actor.plate) {
      const course = actor.plate.course;
      foodMat.current.color.set(
        course === "dessert" ? "#e8cfae" : course === "entry" ? "#8fae72" : "#b07a4a",
      );
    }
    if (liquid.current && actor.glass > 0.05) {
      liquid.current.scale.y = Math.max(0.08, actor.glass);
      liquid.current.position.y = -0.03 + actor.glass * 0.02;
    }
  });

  const tabletop = (
    <>
      <group ref={plate} position={[0.02, TABLE_HEIGHT + 0.007, 0.5]} visible={false}>
        <mesh geometry={G.plate} material={PROPS.china} castShadow />
        <mesh geometry={G.plateRim} material={PROPS.china} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} scale={0.92} />
        <mesh ref={food} geometry={G.food} position={[0, 0.032, 0]} scale={[1, 0.45, 1]}>
          <meshStandardMaterial ref={foodMat} color="#b07a4a" roughness={0.62} />
        </mesh>
      </group>
      <group ref={glass} position={[0.26, TABLE_HEIGHT + 0.052, 0.46]} visible={false}>
        <mesh geometry={G.glass} material={PROPS.glass} />
        <mesh ref={liquid} geometry={G.glass} material={PROPS.wine} scale={[0.85, 0.5, 0.85]} position={[0, -0.03, 0]} />
      </group>
      <group ref={cutlery} position={[0.22, TABLE_HEIGHT + 0.004, 0.5]} rotation={[-Math.PI / 2, 0, 0.12]} visible={false}>
        <mesh geometry={G.fork} material={PROPS.metal} />
        <mesh geometry={G.knife} material={PROPS.metal} position={[0.05, 0, 0]} />
      </group>
    </>
  );

  return (
    <HumanCharacter actor={actor} reducedMotion={reducedMotion} tabletop={tabletop}>
      {/* in the right hand */}
      <group ref={tray} position={[0, 0.06, 0.02]} visible={false}>
        <mesh geometry={G.tray} material={PROPS.metal} />
        <mesh geometry={G.plate} material={PROPS.china} position={[0, 0.012, 0]} />
        <mesh geometry={G.plate} material={PROPS.china} position={[0.09, 0.012, 0.05]} scale={0.8} />
        <mesh geometry={G.glass} material={PROPS.glass} position={[-0.1, 0.07, -0.02]} />
      </group>

      <group ref={terminal} position={[0, -0.02, 0.07]} rotation={[-1.1, 0, 0]} visible={false}>
        <mesh geometry={G.terminal} material={PROPS.terminal} />
        <mesh position={[0, 0.028, 0.011]} material={PROPS.screen}>
          <planeGeometry args={[0.055, 0.042]} />
        </mesh>
      </group>

      <group ref={menu} position={[0, -0.02, 0.08]} rotation={[-0.55, 0, 0]} visible={false}>
        <mesh geometry={G.menu} material={PROPS.paper} />
        <mesh geometry={G.menu} material={PROPS.ink} position={[0, 0, 0.004]} scale={[0.9, 0.94, 1]} />
      </group>
    </HumanCharacter>
  );
}
