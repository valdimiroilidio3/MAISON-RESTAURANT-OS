"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  Expand,
  Grid2X2,
  Loader2,
  Minimize2,
  Moon,
  RotateCcw,
  Sun,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { CAMERA, focusOnTable, nightFromQuery, poseFromQuery, type CameraPose } from "@/lib/scene/framing";
import { TABLE_STATUS_META } from "@/lib/status";
import type { TableStatus } from "@/lib/types";
import type { SceneTable, SceneZone } from "@/components/three/room-types";
import { FloorPlan2D } from "./FloorPlan2D";
import { SceneBoundary } from "./SceneBoundary";
import { useQualityTier } from "./use-quality";

const Canvas3D = dynamic(() => import("./Canvas3D").then((m) => m.Canvas3D), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
      <Loader2 className="size-5 animate-spin text-gold" aria-hidden />
      <p className="text-xs uppercase tracking-[0.2em]">A carregar o salão 3D</p>
    </div>
  ),
});

const LEGEND: TableStatus[] = ["available", "reserved", "occupied", "order_pending", "awaiting_payment", "cleaning"];

export function DiningRoomExplorer({
  tables,
  zones,
  mode,
  selectedId,
  onSelect,
  panel,
  headerActions,
  className,
  initialView = "3d",
  compact = false,
}: {
  tables: SceneTable[];
  zones: SceneZone[];
  mode: "preview" | "operations";
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  panel?: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  initialView?: "3d" | "2d";
  compact?: boolean;
}) {
  const [view, setView] = useState<"3d" | "2d">(initialView);
  const [dimZone, setDimZone] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [scene, setScene] = useState<"loading" | "ready" | "slow" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  // A deep link (?view=entrance&mesa=T14) opens the room on that pose, so a
  // shared link and a screenshot always show the same framing.
  const [focusTarget, setFocusTarget] = useState<CameraPose | null>(() =>
    typeof window === "undefined" ? null : poseFromQuery(window.location.search),
  );
  const [night, setNight] = useState(
    () => (typeof window === "undefined" ? false : nightFromQuery(window.location.search) ?? false),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const { tier, reducedMotion, ready } = useQualityTier();

  // If the 3D bundle never comes up (blocked WebGL, stale chunk, driver crash)
  // the floor keeps working through the 2D plan instead of an endless spinner.
  useEffect(() => {
    if (view !== "3d" || !ready || scene === "ready" || scene === "failed") return;
    const timer = window.setTimeout(() => {
      setScene((current) => (current === "ready" ? current : "slow"));
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [view, ready, scene]);

  const selected = tables.find((t) => t.id === selectedId) ?? null;

  const focusTable = useCallback((id: number | null) => {
    if (!id) {
      setFocusTarget(CAMERA.overview);
      return;
    }
    const table = tables.find((t) => t.id === id);
    if (!table) return;
    setFocusTarget(focusOnTable(table.x, table.z));
  }, [tables]);

  const handleSelect = useCallback(
    (id: number | null) => {
      onSelect(id);
      if (id) focusTable(id);
    },
    [onSelect, focusTable],
  );

  const toggleFullscreen = useCallback(async () => {
    const node = containerRef.current;
    if (!node) return;
    try {
      if (!document.fullscreenElement) {
        await node.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      // fullscreen API unavailable (e.g. iOS Safari on some versions)
    }
  }, []);

  const counts = useMemo(() => {
    const map: Record<TableStatus, number> = {
      available: 0,
      reserved: 0,
      occupied: 0,
      order_pending: 0,
      awaiting_payment: 0,
      cleaning: 0,
    };
    for (const table of tables) if (table.status) map[table.status] += 1;
    return map;
  }, [tables]);

  const visible = useMemo(() => (dimZone ? tables.filter((t) => t.zoneSlug === dimZone) : tables), [tables, dimZone]);

  return (
    <section
      ref={containerRef}
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-line bg-surface md:flex-row",
        fullscreen && "h-screen w-screen rounded-none border-0 bg-ink md:flex-row",
        className,
      )}
      aria-label="Salão interativo"
    >
      <div className="relative flex min-h-[380px] flex-1 flex-col md:min-h-[560px]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/80 px-3 py-2.5">
          <div className="flex items-center gap-1 rounded-full border border-line bg-ink/60 p-0.5" role="tablist" aria-label="Vista do salão">
            <button
              type="button"
              role="tab"
              aria-selected={view === "3d"}
              onClick={() => setView("3d")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition",
                view === "3d" ? "bg-cream text-ink" : "text-muted hover:text-cream",
              )}
            >
              <Boxes className="size-3.5" aria-hidden /> 3D
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "2d"}
              onClick={() => setView("2d")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition",
                view === "2d" ? "bg-cream text-ink" : "text-muted hover:text-cream",
              )}
            >
              <Grid2X2 className="size-3.5" aria-hidden /> Planta 2D
            </button>
          </div>

          <div className="scroll-x flex max-w-full items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDimZone(null)}
              aria-pressed={dimZone === null}
              className={cn("chip transition", dimZone === null ? "border-gold/60 bg-gold/10 text-gold-soft" : "hover:text-cream")}
            >
              Todas
            </button>
            {zones.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setDimZone(dimZone === zone.slug ? null : zone.slug)}
                aria-pressed={dimZone === zone.slug}
                className={cn(
                  "chip transition",
                  dimZone === zone.slug ? "border-gold/60 bg-gold/10 text-gold-soft" : "hover:text-cream",
                )}
              >
                {zone.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {headerActions}
            {view === "3d" && (
              <>
                <button
                  type="button"
                  onClick={() => setNight((value) => !value)}
                  aria-pressed={night}
                  className="btn btn-ghost btn-sm"
                  title={night ? "Mostrar o salão de dia" : "Mostrar o salão à noite"}
                >
                  {night ? <Sun className="size-3.5" aria-hidden /> : <Moon className="size-3.5" aria-hidden />}
                  <span className="hidden sm:inline">{night ? "Noite" : "Dia"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFocusTarget(CAMERA.overview);
                    onSelect(null);
                  }}
                  className="btn btn-ghost btn-sm"
                  title="Repor vista geral"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  <span className="hidden sm:inline">Vista geral</span>
                </button>
              </>
            )}
            <button type="button" onClick={toggleFullscreen} className="btn btn-ghost btn-sm" aria-label={fullscreen ? "Sair de ecrã inteiro" : "Ecrã inteiro"}>
              {fullscreen ? <Minimize2 className="size-3.5" aria-hidden /> : <Expand className="size-3.5" aria-hidden />}
            </button>
          </div>
        </div>

        <div className="relative flex-1 bg-[#0d0b09]">
          {view === "3d" ? (
            ready ? (
              <SceneBoundary
                fallback={(retry) => (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <AlertTriangle className="size-5 text-amber" aria-hidden />
                    <p className="font-display text-lg text-cream">A vista 3D não carregou.</p>
                    <p className="max-w-sm text-[11px] text-muted">A planta 2D tem os mesmos dados e todas as ações.</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setScene("loading");
                          setAttempt((n) => n + 1);
                          retry();
                        }}
                      >
                        Tentar novamente
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setView("2d")}>
                        Usar planta 2D
                      </button>
                    </div>
                  </div>
                )}
                onError={() => setScene("failed")}
              >
                <Canvas3D
                  key={attempt}
                  tables={tables}
                  zones={zones}
                  mode={mode}
                  selectedId={selectedId}
                  dimZone={dimZone}
                  onSelect={handleSelect}
                  hoveredId={hovered}
                  onHover={setHovered}
                  tier={tier}
                  reducedMotion={reducedMotion}
                  focus={focusTarget}
                  daylight={night ? 0.06 : 1}
                  onReady={() => setScene("ready")}
                  onFailure={() => {
                    setScene("failed");
                    setView("2d");
                  }}
                />
              </SceneBoundary>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-5 animate-spin text-gold" aria-hidden />
              </div>
            )
          ) : (
            <div className={cn("h-full w-full", compact ? "p-2" : "p-3")}>
              {scene === "failed" && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber/30 bg-amber/5 px-2.5 py-1.5 text-[10px] text-amber">
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="size-3" aria-hidden /> 3D indisponível — a mostrar a planta 2D.
                  </span>
                  <button
                    type="button"
                    className="text-cream underline decoration-dotted underline-offset-2"
                    onClick={() => {
                      setScene("loading");
                      setAttempt((n) => n + 1);
                      setView("3d");
                    }}
                  >
                    Tentar 3D
                  </button>
                </div>
              )}
              <FloorPlan2D
                tables={tables}
                selectedId={selectedId}
                onSelect={handleSelect}
                dimZone={dimZone}
                mode={mode}
                className="h-full min-h-[340px]"
              />
            </div>
          )}

          {view === "3d" && scene === "slow" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/75 px-6 text-center backdrop-blur-sm">
              <AlertTriangle className="size-5 text-amber" aria-hidden />
              <p className="font-display text-lg text-cream">A vista 3D está a demorar mais do que o esperado.</p>
              <p className="max-w-sm text-[11px] text-muted">
                O WebGL pode estar desativado neste dispositivo. A planta 2D mantém todas as operações.
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setView("2d")}>
                  Usar planta 2D
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.location.reload()}>
                  Recarregar
                </button>
              </div>
            </div>
          )}

          {/* legend */}
          <div className="pointer-events-none absolute left-2.5 top-2.5 max-w-[calc(100%-1.25rem)]">
            <div className="glass pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-2.5 py-2 text-[10px] text-cream-dim">
              {LEGEND.map((status) => {
                const meta = TABLE_STATUS_META[status];
                return (
                  <span key={status} className="inline-flex items-center gap-1.5" title={meta.description}>
                    <span className="status-dot" style={{ backgroundColor: meta.dot }} aria-hidden />
                    <span>{meta.label}</span>
                    {mode === "operations" && <span className="text-muted tnum">{counts[status]}</span>}
                  </span>
                );
              })}
            </div>
          </div>

          {view === "3d" && (
            <div className="pointer-events-none absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-2">
              <p className="rounded-md bg-ink/70 px-2 py-1 text-[10px] text-muted backdrop-blur-sm">
                Arraste para orbitar · scroll para zoom · selecione uma mesa
              </p>
              <p className="hidden rounded-md bg-ink/70 px-2 py-1 text-[10px] text-muted backdrop-blur-sm sm:block">
                {hovered ? `Mesa ${tables.find((t) => t.id === hovered)?.code}` : `${visible.length} mesas`}
              </p>
            </div>
          )}
          {!ready && <div className="absolute inset-0 animate-pulse bg-surface-2/40" aria-hidden />}
        </div>
      </div>

      {panel && (
        <aside
          className={cn(
            "flex max-h-[70vh] w-full shrink-0 flex-col overflow-y-auto border-t border-line bg-surface md:max-h-none md:border-l md:border-t-0",
            compact ? "md:w-[320px]" : "md:w-[380px]",
          )}
          aria-label={selected ? `Detalhe da mesa ${selected.code}` : "Resumo do salão"}
        >
          {panel}
        </aside>
      )}
    </section>
  );
}

export function GuestFigureNote() {
  return (
    <p className="flex items-center gap-1.5 text-[10px] text-muted">
      <UsersRound className="size-3" aria-hidden />
      Figuras 3D estilizadas — não fotorrealistas
    </p>
  );
}
