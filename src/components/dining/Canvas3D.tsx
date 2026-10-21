"use client";

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, AdaptiveDpr, Preload } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { Loader2, RefreshCw } from "lucide-react";
import { DiningRoomScene } from "@/components/three/Room";
import type { SceneTable, SceneZone } from "@/components/three/room-types";
import { QUALITY_PRESETS, type QualityTier } from "./use-quality";

class CanvasErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[MAISON 3D]", error);
    this.props.onError();
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function CameraRig({
  focus,
  controls,
}: {
  focus: { position: [number, number, number]; target: [number, number, number] } | null;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const desired = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!focus) return;
    desired.current = {
      position: new THREE.Vector3(...focus.position),
      target: new THREE.Vector3(...focus.target),
    };
  }, [focus]);

  useFrame((_, delta) => {
    if (!desired.current || !controls.current) return;
    const factor = 1 - Math.pow(0.0001, delta);
    camera.position.lerp(desired.current.position, factor);
    controls.current.target.lerp(desired.current.target, factor);
    controls.current.update();
    if (camera.position.distanceTo(desired.current.position) < 0.05) {
      desired.current = null;
    }
  });
  return null;
}

function SceneFallback() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
      <Loader2 className="size-5 animate-spin text-gold" aria-hidden />
      <p className="text-xs uppercase tracking-[0.2em]">A montar o salão</p>
    </div>
  );
}

export function Canvas3D({
  tables,
  zones,
  mode,
  selectedId,
  hoveredId = null,
  dimZone,
  onSelect,
  onHover,
  tier,
  reducedMotion,
  focus,
  onFailure,
  onReady,
}: {
  tables: SceneTable[];
  zones: SceneZone[];
  mode: "preview" | "operations";
  selectedId: number | null;
  hoveredId?: number | null;
  dimZone: string | null;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  tier: QualityTier;
  reducedMotion: boolean;
  focus: { position: [number, number, number]; target: [number, number, number] } | null;
  onFailure?: () => void;
  onReady?: () => void;
}) {
  const preset = QUALITY_PRESETS[tier];
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setWebgl(!!context);
      if (!context) onFailure?.();
    } catch {
      setWebgl(false);
      onFailure?.();
    }
  }, [onFailure]);

  if (webgl === null) return <SceneFallback />;
  if (!webgl || failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-xl text-cream">O salão 3D não está disponível neste dispositivo</p>
        <p className="max-w-md text-sm text-muted">
          O seu navegador não expõe WebGL. A planta 2D abaixo tem os mesmos dados e continua totalmente funcional.
        </p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFailed(false)}>
          <RefreshCw className="size-3.5" aria-hidden /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <CanvasErrorBoundary onError={() => { setFailed(true); onFailure?.(); }}>
      <Canvas
        shadows={preset.shadows ? "soft" : false}
        dpr={preset.dpr}
        frameloop={reducedMotion ? "demand" : "always"}
        camera={{ position: [15.5, 12.5, 16.5], fov: 32, near: 0.1, far: 120 }}
        gl={{
          antialias: preset.antialias,
          alpha: false,
          powerPreference: "high-performance",
          toneMappingExposure: 1.08,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.setClearColor("#0A0908");
          onReady?.();
        }}
        className="touch-none"
        aria-label="Salão 3D interativo do restaurante"
      >
        <Suspense fallback={null}>
          <DiningRoomScene
            tables={tables}
            zones={zones}
            mode={mode}
            selectedId={selectedId}
            hoveredId={hoveredId}
            dimZone={dimZone}
            onSelect={onSelect}
            onHover={onHover}
            quality={{
              shadows: preset.shadows,
              guests: preset.guests,
              candles: preset.candles,
              labels: preset.labels,
            }}
            reducedMotion={reducedMotion}
          />
          <Preload all />
        </Suspense>
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          target={[1.2, 0.6, 0.6]}
          minDistance={8}
          maxDistance={42}
          maxPolarAngle={Math.PI / 2.32}
          minPolarAngle={0.32}
          panSpeed={0.7}
          rotateSpeed={0.55}
          zoomSpeed={0.7}
        />
        <CameraRig focus={focus} controls={controlsRef} />
        <AdaptiveDpr pixelated />
      </Canvas>
    </CanvasErrorBoundary>
  );
}
