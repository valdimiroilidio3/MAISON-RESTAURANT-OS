"use client";

/**
 * One lighting rig for every 3D view.
 *
 * Three sources, each with a job:
 *  - sun      : the only shadow caster; enters through the east/south glazing.
 *  - sky      : hemisphere fill, cool above / warm bounce below.
 *  - practicals: the chandeliers over the dining room, plus the bar and pass.
 *
 * Daylight is a single scalar (0 = closed night, 1 = midday). It is lerped in
 * `useFrame`, so switching between day and night is a light transition rather
 * than a re-mount, and no view has to re-derive its own intensities.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PRACTICALS } from "@/lib/scene/layout";

export interface LightingQuality {
  shadows: boolean;
  /** Add the bar/pass practicals (low tiers drop them). */
  practicals?: boolean;
}

const SUN_DAY = new THREE.Color("#ffe3c0");
const SUN_NIGHT = new THREE.Color("#7d94c4");
const SKY_DAY = new THREE.Color("#dfe8f0");
const SKY_NIGHT = new THREE.Color("#0b1220");
const GROUND_DAY = new THREE.Color("#8b7a63");
const GROUND_NIGHT = new THREE.Color("#0a0908");
const PRACTICAL = new THREE.Color("#ffc07a");

export function Lighting({
  daylight = 1,
  daylightRef,
  quality,
}: {
  daylight?: number;
  /** Continuous source (the simulation's clock). Overrides `daylight` per frame. */
  daylightRef?: React.MutableRefObject<{ dayLight: number }>;
  quality: LightingQuality;
}) {
  const target = useRef(daylight);
  const current = useRef(daylight);
  const ambient = useRef<THREE.AmbientLight>(null);
  const sky = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const practicals = useRef<THREE.PointLight[]>([]);
  const tableLights = useRef<THREE.PointLight[]>([]);

  target.current = daylight;

  const lamps = useMemo(
    () => [
      { position: PRACTICALS.chandeliers[0], intensity: 26, distance: 9.5 },
      { position: PRACTICALS.chandeliers[1], intensity: 26, distance: 9.5 },
      { position: PRACTICALS.chandeliers[2], intensity: 24, distance: 10 },
      { position: PRACTICALS.barLight, intensity: 14, distance: 7 },
      { position: PRACTICALS.passLight, intensity: 12, distance: 6 },
    ],
    [],
  );

  useFrame((_, delta) => {
    const step = 1 - Math.pow(0.02, Math.min(delta, 0.1));
    if (daylightRef) current.current = daylightRef.current.dayLight;
    else current.current += (target.current - current.current) * step;
    const day = current.current;
    const night = 1 - day;

    if (ambient.current) {
      ambient.current.intensity = THREE.MathUtils.lerp(0.42, 0.82, day);
      ambient.current.color.set("#ffe8cc").lerp(new THREE.Color("#9fb4d8"), night * 0.65);
    }
    if (sky.current) {
      sky.current.intensity = THREE.MathUtils.lerp(0.22, 0.95, day);
      sky.current.color.copy(SKY_NIGHT).lerp(SKY_DAY, day);
      sky.current.groundColor.copy(GROUND_NIGHT).lerp(GROUND_DAY, day);
    }
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(0.2, 2.7, Math.pow(day, 0.8));
      sun.current.color.copy(SUN_NIGHT).lerp(SUN_DAY, day);
    }
    practicals.current.forEach((light, index) => {
      if (!light) return;
      const base = lamps[index]?.intensity ?? 16;
      light.intensity = base * (0.35 + night * 1.55);
    });
    // warm table candles only matter after dark
    tableLights.current.forEach((light) => {
      if (light) light.intensity = 0.18 + night * 0.62;
    });
  });

  return (
    <group name="lighting">
      <ambientLight ref={ambient} intensity={0.82} color="#ffe8cc" />
      {/* bounce: the west wall would otherwise be lit only by ambient and read
          as a void from the default camera */}
      <directionalLight position={[-14, 8, -10]} intensity={0.45} color="#cbb79a" />
      <hemisphereLight ref={sky} args={["#dfe8f0", "#8b7a63", 0.5]} />

      {/* sun: low enough in winter to reach the back of the room, high enough
          to clear the terrace parasols */}
      <directionalLight
        ref={sun}
        position={[19, 16.5, 13]}
        intensity={1.5}
        color="#ffe3c0"
        castShadow={quality.shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={2}
        shadow-camera-far={70}
      />

      {lamps.map((lamp, index) => (
        <pointLight
          key={index}
          ref={(light) => {
            if (light) practicals.current[index] = light;
          }}
          position={[lamp.position.x, lamp.position.y, lamp.position.z]}
          color={PRACTICAL}
          intensity={lamp.intensity}
          distance={lamp.distance}
          decay={2}
        />
      ))}

      {/* one soft candle glow per dining zone, not one per table */}
      {[
        { x: -2.4, z: -2.2 },
        { x: -0.2, z: 3.6 },
        { x: 4.6, z: 2.0 },
        { x: 6.0, z: -3.4 },
        { x: -8.6, z: -1.2 },
      ].map((spot, index) => (
        <pointLight
          key={`candle-${index}`}
          ref={(light) => {
            if (light) tableLights.current[index] = light;
          }}
          position={[spot.x, 1.05, spot.z]}
          color="#ff9d55"
          intensity={0.5}
          distance={3.2}
          decay={2}
        />
      ))}
    </group>
  );
}
