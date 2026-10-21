"use client";

import { useMemo } from "react";
import { TABLE_STATUS_META } from "@/lib/status";
import { cn } from "@/lib/cn";
import type { TableStatus } from "@/lib/types";
import type { SceneTable } from "@/components/three/room-types";

/**
 * Accessible 2D floor plan. Serves as the WebGL fallback and as an alternative
 * view for keyboard users and reduced-motion preferences. It is generated from
 * the exact same table records and coordinates as the 3D scene.
 */
export function FloorPlan2D({
  tables,
  selectedId,
  onSelect,
  dimZone,
  mode,
  className,
}: {
  tables: SceneTable[];
  selectedId: number | null;
  onSelect?: (id: number) => void;
  dimZone: string | null;
  mode: "preview" | "operations";
  className?: string;
}) {
  const { minX, maxX, minZ, maxZ } = useMemo(() => {
    const xs = tables.map((t) => t.x - 1.2);
    const xe = tables.map((t) => t.x + 1.2);
    const zs = tables.map((t) => t.z - 1.2);
    const ze = tables.map((t) => t.z + 1.2);
    return {
      minX: Math.min(-11.5, ...xs),
      maxX: Math.max(10.2, ...xe),
      minZ: Math.min(-8.5, ...zs),
      maxZ: Math.max(9.2, ...ze),
    };
  }, [tables]);

  const width = maxX - minX;
  const height = maxZ - minZ;

  const statusOf = (table: SceneTable): TableStatus => table.status ?? "available";

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line bg-[#100e0b]", className)}>
      <svg
        viewBox={`${minX} ${minZ} ${width} ${height}`}
        className="h-full w-full"
        role="group"
        aria-label="Planta 2D do salão"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#26211b" strokeWidth="0.02" />
          </pattern>
          <radialGradient id="warm" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#2a231a" />
            <stop offset="100%" stopColor="#100e0b" />
          </radialGradient>
        </defs>

        <rect x={minX} y={minZ} width={width} height={height} fill="url(#warm)" />
        <rect x={minX} y={minZ} width={width} height={height} fill="url(#grid)" opacity="0.5" />

        {/* room outline */}
        <rect x={-4.8} y={-7.8} width={14.4} height={16.6} fill="none" stroke="#3a332b" strokeWidth="0.08" />
        <rect x={-11.4} y={-7.8} width={6.6} height={16.6} fill="none" stroke="#3a332b" strokeWidth="0.06" strokeDasharray="0.25 0.18" />
        <rect x={-1.5} y={-10.4} width={5.0} height={2.6} fill="#15171a" stroke="#3a332b" strokeWidth="0.06" />
        <text x={1.0} y={-9.6} textAnchor="middle" fill="#6f685d" fontSize="0.34" letterSpacing="0.08">
          COZINHA
        </text>
        <rect x={3.2} y={-5.5} width={5.6} height={0.7} rx={0.12} fill="#2a2118" stroke="#4a3d2c" strokeWidth="0.05" />
        <text x={6.0} y={-4.5} textAnchor="middle" fill="#6f685d" fontSize="0.3" letterSpacing="0.08">
          BAR
        </text>
        <text x={-8.1} y={-8.4} textAnchor="middle" fill="#6f685d" fontSize="0.34" letterSpacing="0.12">
          ESPLANADA
        </text>

        {tables.map((table) => {
          const status = statusOf(table);
          const meta = TABLE_STATUS_META[status];
          const dimmed = !!dimZone && table.zoneSlug !== dimZone;
          const selected = selectedId === table.id;
          const r = table.shape === "round" ? 0.62 : Math.max(0.62, table.seats * 0.19);
          return (
            <g
              key={table.id}
              role="button"
              tabIndex={0}
              aria-label={`Mesa ${table.code}, ${table.seats} lugares, ${meta.label}${table.reservedTime ? `, reserva às ${table.reservedTime}` : ""}`}
              aria-pressed={selected}
              onClick={() => onSelect?.(table.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(table.id);
                }
              }}
              className="cursor-pointer outline-none"
              opacity={dimmed ? 0.28 : 1}
            >
              {selected && (
                <circle cx={table.x} cy={table.z} r={r + 0.5} fill="none" stroke="#F6F2EA" strokeWidth="0.06" opacity="0.5" />
              )}
              <circle
                cx={table.x}
                cy={table.z}
                r={r + 0.26}
                fill="none"
                stroke={mode === "preview" ? "#C6A66B" : meta.dot}
                strokeWidth={selected ? 0.09 : 0.05}
                opacity={selected ? 1 : 0.45}
              />
              <rect
                x={table.x - r}
                y={table.z - r}
                width={r * 2}
                height={r * 2}
                rx={table.shape === "round" ? r : 0.16}
                fill={mode === "preview" ? "#1c1813" : `${meta.dot}22`}
                stroke={mode === "preview" ? "#4a4136" : meta.dot}
                strokeWidth="0.05"
                className="transition-opacity hover:opacity-100"
              />
              <text
                x={table.x}
                y={table.z + 0.08}
                textAnchor="middle"
                fill="#F6F2EA"
                fontSize="0.34"
                fontWeight="600"
                letterSpacing="0.04"
                style={{ pointerEvents: "none" }}
              >
                {table.code}
              </text>
              <text
                x={table.x}
                y={table.z + 0.44}
                textAnchor="middle"
                fill="#A39C8F"
                fontSize="0.24"
                style={{ pointerEvents: "none" }}
              >
                {table.seats}p
              </text>
              {mode === "operations" && (
                <text
                  x={table.x}
                  y={table.z - r - 0.18}
                  textAnchor="middle"
                  fill={meta.dot}
                  fontSize="0.22"
                  letterSpacing="0.08"
                  style={{ pointerEvents: "none" }}
                >
                  {meta.short.toUpperCase()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="absolute bottom-2 right-3 text-[10px] uppercase tracking-[0.18em] text-muted">
        Planta 2D · acessível por teclado
      </p>
    </div>
  );
}
