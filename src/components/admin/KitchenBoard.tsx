"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChefHat, Clock3, Flame, History, Loader2, Play, Utensils } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTime, minutesSince } from "@/lib/dates";
import type { KitchenItem, KitchenTicket, Role } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";

interface KitchenPayload {
  tickets: KitchenTicket[];
  history: KitchenItem[];
  serverTime: string;
}

type Column = "sent" | "preparing" | "ready";

const COLUMNS: { key: Column; label: string; hint: string; icon: typeof Flame; tone: string }[] = [
  { key: "sent", label: "Recebidos", hint: "por iniciar", icon: Flame, tone: "border-cream/25" },
  { key: "preparing", label: "Em preparação", hint: "no passe", icon: ChefHat, tone: "border-amber/35" },
  { key: "ready", label: "Prontos", hint: "a servir", icon: Check, tone: "border-mint/40" },
];

const COURSE_FILTERS = [
  { key: "all", label: "Tudo" },
  { key: "starter", label: "Entradas" },
  { key: "main", label: "Principais" },
  { key: "dessert", label: "Sobremesas" },
  { key: "drink", label: "Bar" },
];

export function KitchenBoard({ initial, role }: { initial: KitchenPayload; role: Role }) {
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [course, setCourse] = useState("all");
  const [onlyLate, setOnlyLate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const isChef = role === "chef" || role === "manager";
  const isSala = role === "waiter" || role === "manager";

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/kitchen", { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as KitchenPayload;
      setData(next);
    } catch {
      // transient — the next poll retries
    }
  }, []);

  useEffect(() => {
    const poll = window.setInterval(refresh, 5000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh]);

  const move = async (item: KitchenItem, to: "preparing" | "ready" | "served") => {
    setBusy(`${item.id}-${to}`);
    try {
      const response = await fetch(`/api/orders/${item.orderId}/items/${item.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível atualizar.");
      toast.push(
        to === "served" ? `${item.name} marcado como servido.` : to === "ready" ? `${item.name} pronto a servir.` : `${item.name} em preparação.`,
        "success",
      );
      await refresh();
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Erro", "error");
    } finally {
      setBusy(null);
    }
  };

  const visibleTickets = useMemo(() => {
    return data.tickets
      .map((ticket) => ({
        ...ticket,
        items: ticket.items.filter((item) => (course === "all" ? true : item.course === course)),
      }))
      .filter((ticket) => ticket.items.length > 0)
      .filter((ticket) => (onlyLate ? ticket.items.some((item) => item.late) || ticket.late : true));
  }, [data.tickets, course, onlyLate]);

  const grouped = useMemo(() => {
    const result: Record<Column, { ticket: KitchenTicket; items: KitchenItem[] }[]> = {
      sent: [],
      preparing: [],
      ready: [],
    };
    for (const ticket of visibleTickets) {
      for (const column of COLUMNS) {
        const items = ticket.items.filter((item) => item.status === column.key);
        if (items.length > 0) result[column.key].push({ ticket, items });
      }
    }
    return result;
  }, [visibleTickets]);

  const totalItems = data.tickets.reduce((sum, t) => sum + t.items.length, 0);
  const lateItems = data.tickets.reduce((sum, t) => sum + t.items.filter((i) => i.late).length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip tnum">
            <Flame className="size-3 text-amber" aria-hidden /> {totalItems} em preparação
          </span>
          <span className={cn("chip tnum", lateItems ? "border-alert/40 text-alert" : "text-muted")}>
            <AlertTriangle className="size-3" aria-hidden /> {lateItems} atrasados
          </span>
          <span className="chip text-muted">
            <Clock3 className="size-3" aria-hidden /> {formatTime(new Date(now).toISOString())}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {COURSE_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              aria-pressed={course === filter.key}
              onClick={() => setCourse(filter.key)}
              className={cn("chip transition", course === filter.key ? "border-gold/60 bg-gold/10 text-gold-soft" : "hover:text-cream")}
            >
              {filter.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={onlyLate}
            onClick={() => setOnlyLate((value) => !value)}
            className={cn("chip transition", onlyLate ? "border-alert/50 bg-alert/10 text-alert" : "hover:text-cream")}
          >
            Só atrasados
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const Icon = column.icon;
          const tickets = grouped[column.key];
          return (
            <section key={column.key} className={cn("flex min-h-[320px] flex-col rounded-xl border bg-surface/60", column.tone)} aria-label={column.label}>
              <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted" aria-hidden />
                  <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-cream">{column.label}</h2>
                </div>
                <span className="text-[10px] text-muted tnum">
                  {tickets.reduce((sum, t) => sum + t.items.length, 0)} · {column.hint}
                </span>
              </header>
              <div className="flex-1 space-y-2 p-2.5">
                {tickets.length === 0 && (
                  <div className="flex h-full min-h-[180px] items-center justify-center px-3">
                    <EmptyState icon={History} title="Sem pedidos" description={`Nada ${column.hint} neste momento.`} className="border-0" />
                  </div>
                )}
                {tickets.map(({ ticket, items }) => {
                  const oldest = Math.max(...items.map((item) => minutesSince(item.sentAt, now)), 0);
                  const late = items.some((item) => item.late);
                  return (
                    <article
                      key={`${column.key}-${ticket.orderId}`}
                      className={cn(
                        "rounded-lg border bg-surface-2/70",
                        late ? "border-alert/50" : "border-line",
                      )}
                    >
                      <header className="flex items-start justify-between gap-2 border-b border-line/70 px-3 py-2">
                        <div>
                          <p className="text-[11px] font-medium text-cream">
                            #{ticket.orderNumber} · Mesa {ticket.tableCode}
                          </p>
                          <p className="text-[10px] text-muted">
                            {ticket.guests} pax · {ticket.waiterName}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={cn("text-sm tnum", late ? "text-alert" : "text-cream-dim")}>{oldest}′</span>
                          {late && (
                            <p className="flex items-center justify-end gap-1 text-[9px] uppercase tracking-[0.1em] text-alert">
                              <AlertTriangle className="size-2.5" aria-hidden /> atrasado
                            </p>
                          )}
                        </div>
                      </header>
                      <ul className="divide-y divide-line/60">
                        {items.map((item) => (
                          <li key={item.id} className="px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs text-cream">
                                  <span className="mr-1 text-gold-soft tnum">{item.qty}×</span>
                                  {item.name}
                                </p>
                                {item.modifiers.length > 0 && (
                                  <p className="text-[10px] text-gold-soft">{item.modifiers.map((m) => m.name).join(" · ")}</p>
                                )}
                                {item.notes && (
                                  <p className="mt-0.5 rounded border border-amber/25 bg-amber/10 px-1.5 py-0.5 text-[10px] text-amber">
                                    {item.notes}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 text-[10px] text-muted tnum">{minutesSince(item.sentAt, now)}′</span>
                            </div>
                            <div className="mt-1.5">
                              {item.status === "sent" && (
                                <button
                                  type="button"
                                  className="btn btn-gold btn-xs w-full"
                                  disabled={!isChef || busy !== null}
                                  onClick={() => move(item, "preparing")}
                                  title={isChef ? undefined : "Apenas cozinha e gestão"}
                                >
                                  {busy === `${item.id}-preparing` ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Play className="size-3" aria-hidden />}
                                  Iniciar preparação
                                </button>
                              )}
                              {item.status === "preparing" && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs w-full border-mint/40 text-mint"
                                  disabled={!isChef || busy !== null}
                                  onClick={() => move(item, "ready")}
                                >
                                  {busy === `${item.id}-ready` ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
                                  Marcar pronto
                                </button>
                              )}
                              {item.status === "ready" && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs w-full"
                                  disabled={!isSala || busy !== null}
                                  onClick={() => move(item, "served")}
                                >
                                  {busy === `${item.id}-served` ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Utensils className="size-3" aria-hidden />}
                                  Confirmar serviço
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm text-cream">
            <History className="size-4 text-muted" aria-hidden /> Histórico recente
          </h2>
          <span className="text-[10px] text-muted">últimas 6 horas · {data.history.length} artigos</span>
        </header>
        {data.history.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted">Sem pedidos concluídos no período.</p>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">Hora</th>
                  <th className="px-4 py-2 font-medium">Mesa</th>
                  <th className="px-4 py-2 font-medium">Comanda</th>
                  <th className="px-4 py-2 font-medium">Artigo</th>
                  <th className="px-4 py-2 text-right font-medium">Preparação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {data.history.map((item) => (
                  <tr key={item.id} className="table-row-hover">
                    <td className="px-4 py-2 text-muted tnum">{formatTime(item.readyAt ?? item.servedAt)}</td>
                    <td className="px-4 py-2 text-cream">{item.tableCode}</td>
                    <td className="px-4 py-2 text-muted tnum">#{item.orderNumber}</td>
                    <td className="px-4 py-2 text-cream">{item.qty}× {item.name}</td>
                    <td className="px-4 py-2 text-right text-muted tnum">{item.prepMinutes} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
