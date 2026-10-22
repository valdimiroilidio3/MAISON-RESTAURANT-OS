"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  Bath,
  ChevronRight,
  Clock3,
  FastForward,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Sun,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import * as THREE from "three";
import { cn } from "@/lib/cn";
import { eur } from "@/lib/money";
import { formatClock, nextOpening, Simulation, weekdayShort, type SimSnapshot } from "@/lib/simulation/engine";
import type { Phase, SimProduct, SimTable } from "@/lib/simulation/types";
import { SimulationWorld } from "@/components/three/sim/SimulationScene";
import { FitCamera, RenderProbe } from "@/components/three/world/CameraRig";
import { CAMERA } from "@/lib/scene/framing";

const SPEEDS = [
  { value: 1, label: "1× tempo real" },
  { value: 8, label: "8×" },
  { value: 20, label: "20×" },
  { value: 60, label: "60×" },
  { value: 180, label: "180×" },
  { value: 360, label: "360×" },
];

const STATE_LABEL: Record<string, string> = {
  arriving: "a chegar",
  seating: "a sentar-se",
  ordering: "a pedir",
  waiting: "à espera do prato",
  eating: "a comer",
  clearing: "a retirar pratos",
  dessert: "sobremesa",
  paying: "a pagar",
  leaving: "a sair",
  done: "terminado",
};

const PHASE_TONE: Record<Phase, string> = {
  closed: "border-cream/15 bg-cream/5 text-muted",
  prep: "border-amber/30 bg-amber/10 text-amber",
  lunch: "border-mint/30 bg-mint/10 text-mint",
  break: "border-cream/15 bg-cream/5 text-muted",
  dinner: "border-gold/30 bg-gold/10 text-gold-soft",
  closing: "border-coral/30 bg-coral/10 text-coral",
};

const STATUS_DOT: Record<string, string> = {
  free: "bg-cream/20",
  reserved: "bg-gold",
  seated: "bg-gold",
  eating: "bg-mint",
  paying: "bg-coral",
  cleaning: "bg-cream/40",
};

/** Frames the whole room (interior + terrace) on both wide and narrow screens. */
function phaseClock(phase: Phase) {
  if (phase === "lunch") return "12:00–15:00";
  if (phase === "dinner") return "19:00–23:00";
  if (phase === "prep") return "preparação";
  if (phase === "closed") return "fechado";
  return "a fechar";
}

export function LiveSalon({
  tables,
  products,
  startWeekday,
  startMinutes,
  startDate,
  seed,
}: {
  tables: SimTable[];
  products: SimProduct[];
  startWeekday: number;
  startMinutes: number;
  startDate: string;
  seed: number;
}) {
  const simRef = useRef<Simulation | null>(null);
  if (simRef.current === null) {
    simRef.current = new Simulation({
      tables,
      products,
      startWeekday,
      startMinutes,
      startDate,
      seed,
      speed: 20,
    });
  }
  const sim = simRef.current;
  const lightRef = useRef({ dayLight: sim.dayLight });
  const [snapshot, setSnapshot] = useState<SimSnapshot>(() => sim.snapshot());
  const [castCount, setCastCount] = useState(sim.actors.filter((actor) => !actor.hidden && !actor.inBathroom).length);
  const [speed, setSpeed] = useState(sim.speed);
  const [paused, setPaused] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [focusTableId, setFocusTableId] = useState<number | null>(null);
  const [tab, setTab] = useState<"parties" | "staff" | "events">("parties");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  const [PROBE] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug3d") === "1");

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!context) setWebgl(false);
  }, []);

  /* Real-time loop: advances the engine every animation frame and refreshes the
     HTML panels a few times per second. */
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let publishAt = 0;
    const loop = (now: number) => {
      const delta = Math.min(400, now - last);
      last = now;
      sim.tick(delta);
      lightRef.current.dayLight = sim.dayLight;
      if (now - publishAt > 220) {
        publishAt = now;
        setSnapshot(sim.snapshot());
        setCastCount(sim.actors.filter((actor) => !actor.hidden && !actor.inBathroom).length);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [sim]);

  const applySpeed = useCallback(
    (value: number) => {
      setSpeed(value);
      sim.setSpeed(value);
    },
    [sim],
  );

  const togglePaused = useCallback(() => {
    setPaused((current) => {
      sim.setPaused(!current);
      return !current;
    });
  }, [sim]);

  const skipAhead = useCallback(() => {
    sim.skipToNextService();
    lightRef.current.dayLight = sim.dayLight;
    setSnapshot(sim.snapshot());
  }, [sim]);

  const restart = useCallback(() => {
    sim.reset(seed);
    sim.setPaused(false);
    setPaused(false);
    setSpeed(sim.speed);
    setSnapshot(sim.snapshot());
    setCastCount(sim.actors.filter((actor) => !actor.hidden && !actor.inBathroom).length);
    lightRef.current.dayLight = sim.dayLight;
  }, [seed, sim]);

  const quality = useMemo(() => ({ shadows: true, lamps: true }), []);
  const openLabel = formatClock(snapshot.clock.minutes);
  const opening = nextOpening(snapshot.clock.weekday, snapshot.clock.minutes);
  const guests = snapshot.parties.reduce((sum, party) => sum + party.size, 0);
  const waiting = snapshot.parties.filter((party) => party.state === "arriving" || party.state === "seating").length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* --------------------------------------------------------- stage */}
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-surface/50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 bg-ink/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="text-cream">
                <p className="font-display text-2xl leading-none tabular-nums">{openLabel}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted">
                  {weekdayShort(snapshot.clock.weekday)} · {snapshot.clock.date}
                </p>
              </div>
              <span className={cn("chip border text-[10px] uppercase tracking-[0.14em]", PHASE_TONE[snapshot.phase.phase])}>
                {snapshot.phase.label}
              </span>
              <span className="hidden items-center gap-1 text-[10px] text-muted sm:inline-flex">
                {snapshot.dayLight > 0.5 ? <Sun className="size-3" aria-hidden /> : <Moon className="size-3" aria-hidden />}
                {snapshot.dayLight > 0.5 ? "dia" : "noite"} · {phaseClock(snapshot.phase.phase)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="btn btn-ghost btn-sm" onClick={togglePaused} aria-pressed={paused}>
                {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
                {paused ? "Retomar" : "Pausar"}
              </button>
              <label className="sr-only" htmlFor="sim-speed">
                Velocidade da simulação
              </label>
              <select
                id="sim-speed"
                className="input h-8 py-0 text-xs"
                value={speed}
                onChange={(event) => applySpeed(Number(event.target.value))}
              >
                {SPEEDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost btn-sm" onClick={skipAhead} title="Avançar para o próximo serviço">
                <FastForward className="size-3.5" aria-hidden />
                Próximo serviço
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={restart} title="Recomeçar o dia">
                <RotateCcw className="size-3.5" aria-hidden />
                Recomeçar
              </button>
            </div>
          </div>

          <div className="relative h-[420px] w-full sm:h-[520px]">
            {webgl && mounted ? (
              <Canvas
                shadows
                dpr={[1, 1.75]}
                gl={{ antialias: true, powerPreference: "high-performance" }}
                camera={{ position: [...CAMERA.overview.position], fov: CAMERA.overview.fov, near: 0.2, far: 160 }}
                onCreated={({ gl }) => {
                  gl.toneMapping = THREE.ACESFilmicToneMapping;
                  gl.toneMappingExposure = 1.02;
                  gl.outputColorSpace = THREE.SRGBColorSpace;
                }}
              >
                <FitCamera />
                <SimulationWorld
                  sim={sim}
                  castCount={castCount}
                  quality={quality}
                  reducedMotion={false}
                  focusedTableId={focusTableId}
                  light={lightRef}
                />
                <RenderProbe enabled={PROBE} />
                <OrbitControls
                  target={[...CAMERA.overview.target]}
                  enablePan
                  minDistance={CAMERA.orbit.minDistance}
                  maxDistance={CAMERA.orbit.maxDistance}
                  maxPolarAngle={CAMERA.orbit.maxPolarAngle}
                  enableDamping
                  dampingFactor={0.08}
                />
              </Canvas>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="font-display text-xl text-cream">A cena 3D não está disponível neste navegador</p>
                <p className="max-w-md text-sm text-muted">
                  A simulação continua a correr: acompanhe as mesas, as equipas e os eventos no painel lateral.
                </p>
              </div>
            )}

            {!snapshot.phase.isOpen && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/80 to-transparent p-4">
                <div className="pointer-events-auto mx-auto flex max-w-md flex-col items-center gap-2 rounded-xl border border-line bg-surface/90 px-4 py-3 text-center backdrop-blur">
                  <Clock3 className="size-4 text-gold" aria-hidden />
                  <p className="text-sm text-cream">
                    {snapshot.phase.label}
                    {snapshot.phase.detail ? ` · ${snapshot.phase.detail}` : ""}
                  </p>
                  <p className="text-xs text-muted">
                    Próna abertura: {weekdayShort(opening.weekday)} às {formatClock(opening.minutes)}.
                  </p>
                  <button type="button" className="btn btn-primary btn-sm" onClick={skipAhead}>
                    Avançar para a abertura
                    <ChevronRight className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            )}

            {paused && (
              <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-amber/40 bg-ink/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-amber">
                em pausa
              </div>
            )}
          </div>

          <p className="border-t border-line/60 px-4 py-2 text-[10px] leading-relaxed text-muted">
            Figuras 3D estilizadas (não fotorrealistas), construídas por primitivas e animadas em tempo real. A sala
            respeita o fuso de Lisboa: almoço 12:00–15:00, jantar 19:00–23:00, encerrado à segunda e à terça.
          </p>
        </div>

        {/* stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {[
            { label: "na sala", value: guests, icon: Users },
            { label: "mesas ocupadas", value: `${snapshot.stats.tablesOccupied}/${snapshot.stats.tablesTotal}`, icon: Utensils },
            { label: "pedidos", value: snapshot.stats.orders, icon: Utensils },
            { label: "servidos", value: snapshot.stats.served, icon: Utensils },
            { label: "conta paga", value: snapshot.stats.paid, icon: Wallet },
            { label: "receita", value: eur(snapshot.stats.revenueCents), icon: Wallet },
            { label: "casa de banho", value: snapshot.stats.bathrooms, icon: Bath },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-line bg-surface/40 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-muted">
                <stat.icon className="size-3" aria-hidden />
                {stat.label}
              </p>
              <p className="mt-1 text-sm text-cream tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------ inspector */}
      <aside className="flex min-h-[420px] flex-col rounded-2xl border border-line bg-surface/40">
        <div className="flex items-center gap-1 border-b border-line/70 p-1.5" role="tablist" aria-label="Detalhe da simulação">
          {(
            [
              ["parties", `Mesas · ${snapshot.parties.length}`],
              ["staff", "Equipa"],
              ["events", "Registo"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-[11px] transition",
                tab === key ? "bg-cream/10 text-cream" : "text-muted hover:text-cream",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {tab === "parties" && (
            <div className="space-y-1.5">
              {snapshot.parties.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted">
                  {snapshot.phase.isOpen ? "Ainda sem clientes na sala." : "Fora de serviço. Ninguém na sala."}
                </p>
              )}
              {snapshot.parties.map((party) => (
                <button
                  key={party.id}
                  type="button"
                  onClick={() => setFocusTableId((current) => (current === party.tableId ? null : party.tableId))}
                  className={cn(
                    "w-full rounded-lg border px-2.5 py-2 text-left transition",
                    focusTableId === party.tableId
                      ? "border-gold/40 bg-gold/[0.07]"
                      : "border-line/60 bg-ink/30 hover:border-cream/20",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-cream">
                      <span className={cn("size-1.5 rounded-full", STATUS_DOT[snapshot.tables.find((t) => t.id === party.tableId)?.status ?? "free"])} />
                      {party.tableCode}
                      <span className="text-muted">· {party.size} pax</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-gold-soft">{STATE_LABEL[party.state] ?? party.state}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                    <span>
                      {party.course ? `${party.course === "entry" ? "entrada" : party.course === "main" ? "prato" : "sobremesa"} · ` : ""}
                      {party.paymentMode === "counter" ? "paga ao balcão" : "paga na mesa"}
                    </span>
                    <span className="tabular-nums text-cream/80">{eur(party.totalCents)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === "staff" && (
            <div className="space-y-1.5">
              {snapshot.staff.map((member) => (
                <div key={member.id} className="rounded-lg border border-line/60 bg-ink/30 px-2.5 py-2">
                  <div className="flex items-center justify-between text-xs text-cream">
                    <span>{member.name}</span>
                    <span className="text-[10px] uppercase tracking-[0.1em] text-muted">{member.role}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {member.shift === "off"
                      ? "fora de serviço"
                      : member.shift === "break"
                        ? "em pausa"
                        : member.task
                          ? `tarefa: ${member.task}`
                          : "disponível"}
                  </p>
                </div>
              ))}
              <p className="px-1 pt-2 text-[10px] leading-relaxed text-muted">
                {waiting > 0 ? `${waiting} grupo(s) a entrar ou a sentar-se.` : "Sem grupos à entrada."}
              </p>
            </div>
          )}

          {tab === "events" && (
            <ol className="space-y-1">
              {snapshot.events.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted">Sem eventos ainda.</li>}
              {snapshot.events.map((event) => (
                <li key={event.id} className="rounded-md px-2 py-1 text-[11px] text-muted odd:bg-cream/[0.03]">
                  <span className="tabular-nums text-cream/70">{event.text.split(" · ")[0]}</span>{" "}
                  {event.text.slice(event.text.indexOf(" · ") + 3)}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="border-t border-line/70 p-3">
          <p className="text-[10px] leading-relaxed text-muted">
            {snapshot.stats.arrivals} entradas · {snapshot.stats.paid} contas fechadas · ticket médio{" "}
            {eur(snapshot.stats.averageTicketCents)}
          </p>
        </div>
      </aside>
    </div>
  );
}
