"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Boxes, Loader2, Maximize2, RefreshCw, UsersRound, X } from "lucide-react";
import { SceneBoundary } from "./SceneBoundary";
import type { PublicFloor } from "@/lib/public-types";
import type { SceneTable } from "@/components/three/room-types";
import { cn } from "@/lib/cn";

const Canvas3D = dynamic(() => import("./Canvas3D").then((m) => m.Canvas3D), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted">
      <Loader2 className="size-5 animate-spin text-gold" aria-hidden />
      <p className="text-xs uppercase tracking-[0.2em]">A construir o salão</p>
    </div>
  ),
});

export function PublicSalonPreview({
  floor,
  height = "h-[520px]",
  autoMount = false,
  showCta = true,
}: {
  floor: PublicFloor;
  height?: string;
  autoMount?: boolean;
  showCta?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(autoMount);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "slow" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    if (autoMount) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [autoMount]);

  // Never leave the visitor on an endless spinner: if the WebGL bundle does not
  // come up in time, offer a retry and the accessible 2D plan.
  useEffect(() => {
    if (!mounted || status === "ready" || status === "error") return;
    const timer = window.setTimeout(() => {
      setStatus((current) => (current === "ready" ? current : "slow"));
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [mounted, status]);

  const tables: SceneTable[] = useMemo(
    () =>
      floor.tables.map((table) => ({
        id: table.id,
        code: table.code,
        seats: table.seats,
        shape: table.shape,
        x: table.x,
        z: table.z,
        rotation: table.rotation,
        zoneSlug: table.zoneSlug,
        zoneName: table.zoneName,
      })),
    [floor.tables],
  );

  const selected = tables.find((t) => t.id === selectedId) ?? null;

  return (
    <div ref={container} className={cn("relative overflow-hidden rounded-2xl border border-line bg-[#0d0b09]", height)}>
      {mounted ? (
        <SceneBoundary
          fallback={(retry) => (
            <PreviewError
              onRetry={() => {
                setStatus("loading");
                setAttempt((n) => n + 1);
                retry();
              }}
            />
          )}
          onError={() => setStatus("error")}
        >
          <Canvas3D
            key={attempt}
            onReady={() => setStatus("ready")}
            onFailure={() => setStatus("error")}
            tables={tables}
            zones={floor.zones}
            mode="preview"
            selectedId={selectedId}
            dimZone={null}
            onSelect={setSelectedId}
            onHover={() => {}}
            tier="medium"
            reducedMotion={reducedMotion}
            focus={null}
          />
        </SceneBoundary>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_50%_60%,#221c15,#0a0908)] px-6 text-center">
          <Boxes className="size-6 text-gold" aria-hidden />
          <p className="max-w-xs font-display text-xl text-cream">O salão tridimensional está à sua espera.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setMounted(true)}>
            Ativar vista 3D
          </button>
          <p className="text-[10px] text-muted">São necessários ~2 MB de dados e WebGL.</p>
        </div>
      )}

      {mounted && status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_60%,#1b1611,#0a0908)] text-muted">
          <Loader2 className="size-5 animate-spin text-gold" aria-hidden />
          <p className="text-[10px] uppercase tracking-[0.2em]">A construir o salão</p>
        </div>
      )}

      {mounted && status === "slow" && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink/70 px-6 text-center backdrop-blur-sm">
          <div className="max-w-sm">
            <AlertTriangle className="mx-auto size-5 text-amber" aria-hidden />
            <p className="mt-3 font-display text-lg text-cream">A vista 3D está a demorar mais do que o esperado.</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              O WebGL pode estar desativado neste navegador. A planta 2D tem os mesmos dados e continua disponível.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
                <RefreshCw className="size-3.5" aria-hidden /> Recarregar
              </button>
              <a href="/salon#planta-2d" className="btn btn-ghost btn-sm">
                Ver planta 2D
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="glass pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-cream-dim">
          <span className="status-dot bg-gold" aria-hidden />
          Salão · {floor.tables.length} mesas · {floor.capacity} lugares
        </div>
        {showCta && (
          <Link href="/salon" className="btn btn-ghost btn-xs pointer-events-auto hidden sm:inline-flex">
            <Maximize2 className="size-3" aria-hidden /> Ecrã inteiro
          </Link>
        )}
      </div>

      {selected && (
        <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-ink/85 p-3 backdrop-blur-md sm:inset-x-auto sm:right-3 sm:w-72">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Mesa</p>
            <p className="font-display text-lg text-cream">
              {selected.code} · {selected.zoneName}
            </p>
            <p className="text-[11px] text-muted">
              {selected.seats} lugares · {selected.shape === "round" ? "redonda" : "retangular"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/reservas" className="btn btn-primary btn-xs">
              Reservar
            </Link>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSelectedId(null)} aria-label="Fechar detalhe">
              <X className="size-3" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <p className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-ink/70 px-2 py-1 text-[9px] text-muted backdrop-blur-sm">
        <UsersRound className="size-2.5" aria-hidden /> Figuras 3D estilizadas (não fotorrealistas) · vista de demonstração
      </p>
    </div>
  );
}

function PreviewError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_60%,#221c15,#0a0908)] px-6 text-center">
      <AlertTriangle className="size-5 text-amber" aria-hidden />
      <p className="max-w-sm font-display text-xl text-cream">Não foi possível carregar a vista 3D.</p>
      <p className="max-w-sm text-[11px] leading-relaxed text-muted">
        Isto acontece quando o WebGL está bloqueado ou a versão da aplicação mudou. A planta 2D abaixo tem a mesma
        informação.
      </p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden /> Tentar novamente
        </button>
        <a href="/salon#planta-2d" className="btn btn-ghost btn-sm">
          Ver planta 2D
        </a>
      </div>
    </div>
  );
}
