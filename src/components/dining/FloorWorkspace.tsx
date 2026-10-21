"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  ReceiptText,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { eur } from "@/lib/money";
import { formatTime, minutesSince } from "@/lib/dates";
import { ITEM_STATUS_LABEL, PAYMENT_METHOD_LABEL, TABLE_STATUS_META } from "@/lib/status";
import type {
  FloorSnapshot,
  MenuCatalog,
  MenuProduct,
  OrderDetail,
  Role,
  TableSummary,
} from "@/lib/types";
import type { TableDetailPayload } from "@/lib/public-types";
import { DiningRoomExplorer, GuestFigureNote } from "./DiningRoomExplorer";
import { TableStatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível concluir a operação.");
  return payload as T;
}

const REFRESH_MS = 15_000;

export function FloorWorkspace({
  initialSnapshot,
  catalog,
  role,
  mode = "operations",
  initialSelectedId = null,
}: {
  initialSnapshot: FloorSnapshot;
  catalog: MenuCatalog;
  role: Role;
  mode?: "operations" | "dashboard";
  initialSelectedId?: number | null;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId);
  const [detail, setDetail] = useState<TableDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number>(Date.now());
  const toast = useToast();
  const canOperate = role === "manager" || role === "waiter";
  const canManage = role === "manager";

  const refreshFloor = useCallback(async () => {
    try {
      const next = await api<FloorSnapshot>("/api/floor", { cache: "no-store" });
      setSnapshot(next);
      setSyncedAt(Date.now());
      return next;
    } catch {
      return null;
    }
  }, []);

  const refreshDetail = useCallback(async (tableId: number) => {
    try {
      const next = await api<TableDetailPayload>(`/api/tables/${tableId}`, { cache: "no-store" });
      setDetail(next);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Erro ao carregar a mesa", "error");
    }
  }, [toast]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api<TableDetailPayload>(`/api/tables/${selectedId}`, { cache: "no-store" })
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((error) => {
        if (!cancelled) toast.push(error instanceof Error ? error.message : "Erro ao carregar a mesa", "error");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, toast]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const next = await refreshFloor();
      if (next && selectedId != null) {
        const table = next.tables.find((t) => t.id === selectedId);
        if (table?.order) await refreshDetail(selectedId);
      }
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshFloor, refreshDetail, selectedId]);

  const afterMutation = useCallback(
    async (message?: string) => {
      if (message) toast.push(message, "success");
      await refreshFloor();
      if (selectedId != null) await refreshDetail(selectedId);
    },
    [refreshFloor, refreshDetail, selectedId, toast],
  );

  const tables = useMemo(() => {
    const zoneById = new Map(snapshot.zones.map((z) => [z.id, z]));
    return snapshot.tables.map((table) => ({
      id: table.id,
      code: table.code,
      seats: table.seats,
      shape: table.shape,
      x: table.x,
      z: table.z,
      rotation: table.rotation,
      zoneSlug: zoneById.get(table.zoneId)?.slug ?? "sala",
      zoneName: table.zoneName,
      status: table.status,
      guests: table.order?.guests,
      orderNumber: table.order?.number,
      reservedTime: table.reservation?.time,
    }));
  }, [snapshot]);

  const panel = (
    <TableInspector
      tableId={selectedId}
      snapshot={snapshot}
      catalog={catalog}
      role={role}
      detail={detail}
      loading={detailLoading}
      canOperate={canOperate}
      canManage={canManage}
      onClose={() => setSelectedId(null)}
      onSelectTable={setSelectedId}
      onMutate={afterMutation}
    />
  );

  return (
    <div className="space-y-3">
      <DiningRoomExplorer
        tables={tables}
        zones={snapshot.zones}
        mode="operations"
        selectedId={selectedId}
        onSelect={setSelectedId}
        panel={panel}
        compact={mode === "dashboard"}
        className={mode === "dashboard" ? "shadow-[0_1px_0_rgba(255,255,255,0.03)]" : undefined}
        headerActions={
          <span className="hidden items-center gap-1.5 text-[10px] text-muted sm:inline-flex" title="Atualização automática">
            <span className="status-dot bg-mint" aria-hidden />
            sincronizado {formatTime(new Date(syncedAt).toISOString())}
          </span>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <GuestFigureNote />
        <p className="text-[10px] text-muted">
          Os estados são sincronizados a cada 15 s · as ações são transacionais no servidor
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string | number; tone?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={cn("mt-1 text-lg tnum", tone ?? "text-cream")} title={hint}>
        {value}
      </p>
    </div>
  );
}

function TableInspector({
  tableId,
  snapshot,
  catalog,
  role,
  detail,
  loading,
  canOperate,
  canManage,
  onClose,
  onSelectTable,
  onMutate,
}: {
  tableId: number | null;
  snapshot: FloorSnapshot;
  catalog: MenuCatalog;
  role: Role;
  detail: TableDetailPayload | null;
  loading: boolean;
  canOperate: boolean;
  canManage: boolean;
  onClose: () => void;
  onSelectTable: (id: number) => void;
  onMutate: (message?: string) => Promise<void>;
}) {
  const toast = useToast();

  if (tableId == null) {
    const activeTables = snapshot.tables.filter((t) => t.order);
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line px-5 py-4">
          <p className="eyebrow">Sala em direto</p>
          <div className="mt-2 flex items-end justify-between">
            <h3 className="font-display text-xl text-cream">Resumo do turno</h3>
            <span className="chip tnum">{snapshot.stats.guests} pax</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 px-5 py-4">
          <Stat label="Livres" value={snapshot.stats.available} />
          <Stat label="Reserva" value={snapshot.stats.reserved} tone="text-gold" />
          <Stat label="Ocupadas" value={snapshot.stats.occupied} tone="text-amber" />
          <Stat label="Pendente" value={snapshot.stats.orderPending} tone="text-mint" />
          <Stat label="Pagamento" value={snapshot.stats.awaitingPayment} tone="text-alert" />
          <Stat label="Limpeza" value={snapshot.stats.cleaning} tone="text-slate" />
        </div>
        <div className="border-y border-line bg-surface-2/40 px-5 py-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Consumo em aberto</p>
          <p className="mt-1 font-display text-2xl text-cream tnum">{eur(snapshot.stats.openRevenueCents)}</p>
        </div>
        <div className="flex-1 px-5 py-4">
          <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted">Comandas abertas</p>
          {activeTables.length === 0 ? (
            <EmptyState icon={UtensilsCrossed} title="Sem comandas abertas" description="Selecione uma mesa no salão para abrir uma comanda." />
          ) : (
            <ul className="space-y-1.5">
              {activeTables.map((table) => (
                <li key={table.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTable(table.id)}
                    className="group flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left transition hover:border-gold/40"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex size-8 items-center justify-center rounded-md border border-line-strong font-display text-sm text-cream">
                        {table.code.replace("T", "")}
                      </span>
                      <span>
                        <span className="block text-xs text-cream">#{table.order?.number} · {table.order?.guests} pax</span>
                        <span className="block text-[10px] text-muted">
                          {table.order?.waiterName} · {formatTime(table.order?.openedAt ?? null)}
                        </span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xs text-cream tnum">{eur(table.order?.totalCents ?? 0)}</span>
                      <TableStatusBadge status={table.status} size="sm" className="mt-0.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-line px-5 py-3 text-[10px] text-muted">
          Os dados desta vista vêm das mesas e comandas reais da base de dados.
        </div>
      </div>
    );
  }

  const table = snapshot.tables.find((t) => t.id === tableId) ?? detail?.table ?? null;
  if (!table) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        {loading ? <Loader2 className="size-5 animate-spin text-gold" aria-hidden /> : <p className="text-sm text-muted">Mesa não encontrada.</p>}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <button type="button" onClick={onClose} className="mb-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted hover:text-cream">
              <ChevronLeft className="size-3" aria-hidden /> Salão
            </button>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-2xl text-cream">Mesa {table.code}</h3>
              <TableStatusBadge status={table.status} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {table.zoneName} · {table.seats} lugares
              {table.reservation ? ` · reserva ${table.reservation.time} (${table.reservation.customerName.split(" ")[0]})` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-xs !rounded-full !p-1.5" aria-label="Fechar detalhe">
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {loading && !detail ? (
        <div className="space-y-2 p-5">
          <div className="skeleton h-20" />
          <div className="skeleton h-36" />
        </div>
      ) : (
        <div className="flex-1 divide-y divide-line">
          <TableActions table={table} canOperate={canOperate} onMutate={onMutate} />

          {detail?.upcomingReservations && detail.upcomingReservations.length > 0 && !detail.order && (
            <div className="px-5 py-3">
              <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted">Próximas reservas</p>
              <ul className="space-y-1">
                {detail.upcomingReservations.map((res) => (
                  <li key={res.id} className="flex items-center justify-between text-xs">
                    <span className="text-cream-dim">{res.time} · {res.customerName}</span>
                    <span className="text-muted tnum">{res.partySize} pax</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!detail?.order && table.order && (
            <div className="px-5 py-4 text-sm text-muted">
              <Loader2 className="mr-2 inline size-3.5 animate-spin" aria-hidden />
              A carregar comanda #{table.order.number}…
            </div>
          )}

          {!detail?.order && !table.order && canOperate && (
            <OpenOrderForm table={table} onMutate={onMutate} />
          )}

          {!detail?.order && !table.order && !canOperate && (
            <div className="px-5 py-6">
              <EmptyState icon={ReceiptText} title="Mesa livre" description="O perfil de cozinha tem acesso de leitura ao salão." />
            </div>
          )}

          {detail?.order && (
            <OrderPanel
              order={detail.order}
              table={table}
              catalog={catalog}
              canOperate={canOperate}
              canManage={canManage}
              onMutate={onMutate}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TableActions({
  table,
  canOperate,
  onMutate,
}: {
  table: TableSummary;
  canOperate: boolean;
  onMutate: (message?: string) => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (action: "release" | "cleaning") => {
    setBusy(action);
    try {
      await api(`/api/tables/${table.id}`, { method: "POST", body: JSON.stringify({ action }) });
      await onMutate(action === "release" ? "Mesa libertada." : "Mesa marcada em limpeza.");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Erro", "error");
    } finally {
      setBusy(null);
    }
  };

  if (!canOperate) return null;
  if (table.order) return null;

  return (
    <div className="flex flex-wrap gap-2 px-5 py-3">
      {table.status === "cleaning" ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => run("release")} disabled={busy !== null}>
          <Sparkles className="size-3.5" aria-hidden /> Marcar mesa pronta
        </button>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => run("cleaning")} disabled={busy !== null}>
          <Sparkles className="size-3.5" aria-hidden /> Marcar em limpeza
        </button>
      )}
    </div>
  );
}

function OpenOrderForm({ table, onMutate }: { table: TableSummary; onMutate: (message?: string) => Promise<void> }) {
  const toast = useToast();
  const [guests, setGuests] = useState(Math.min(table.seats, table.reservation?.partySize ?? 2));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api<{ number: number }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ tableId: table.id, guests, notes }),
      });
      await onMutate(`Comanda #${result.number} aberta.`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Erro ao abrir comanda", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 px-5 py-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Abrir comanda</p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label" htmlFor={`guests-${table.id}`}>
            Pessoas
          </label>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost btn-xs !p-1.5" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="Menos pessoas">
              <Minus className="size-3" aria-hidden />
            </button>
            <input
              id={`guests-${table.id}`}
              type="number"
              min={1}
              max={30}
              value={guests}
              onChange={(event) => setGuests(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}
              className="field w-16 text-center tnum"
            />
            <button type="button" className="btn btn-ghost btn-xs !p-1.5" onClick={() => setGuests((g) => Math.min(30, g + 1))} aria-label="Mais pessoas">
              <Plus className="size-3" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex-1">
          <label className="label" htmlFor={`notes-${table.id}`}>
            Nota (opcional)
          </label>
          <input
            id={`notes-${table.id}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 300))}
            className="field"
            placeholder="Aniversário, alergia..."
          />
        </div>
      </div>
      {table.reservation && (
        <p className="text-[11px] text-gold-soft">
          Reserva confirmada às {table.reservation.time} — {table.reservation.customerName} ({table.reservation.partySize} pax).
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ArrowRight className="size-3.5" aria-hidden />}
        Abrir comanda
      </button>
    </form>
  );
}

function OrderPanel({
  order,
  table,
  catalog,
  canOperate,
  canManage,
  onMutate,
}: {
  order: OrderDetail;
  table: TableSummary;
  catalog: MenuCatalog;
  canOperate: boolean;
  canManage: boolean;
  onMutate: (message?: string) => Promise<void>;
}) {
  const toast = useToast();
  const [picker, setPicker] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ id: number; name: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const drafts = order.items.filter((item) => item.status === "draft");
  const serverReady = order.items.filter((item) => item.status === "ready");
  const canClose = order.totals.balanceCents === 0 && order.payments.every((p) => p.status !== "recorded") && order.items.every((i) => !["draft", "sent", "preparing", "ready"].includes(i.status));

  const act = async (key: string, run: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await run();
      await onMutate(success);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Erro", "error");
    } finally {
      setBusy(null);
    }
  };

  const send = () =>
    act(
      "send",
      () => api(`/api/orders/${order.id}/send`, { method: "POST" }),
      "Pedido enviado para a cozinha.",
    );

  const serve = (itemId: number) =>
    act(
      `serve-${itemId}`,
      () => api(`/api/orders/${order.id}/items/${itemId}/status`, { method: "POST", body: JSON.stringify({ to: "served" }) }),
      "Artigo marcado como servido.",
    );

  const updateQty = (itemId: number, qty: number) =>
    act(`qty-${itemId}`, () => api(`/api/orders/${order.id}/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ qty }) }), "Quantidade atualizada.");

  return (
    <div className="divide-y divide-line">
      <div className="grid grid-cols-3 gap-2 px-5 py-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Comanda</p>
          <p className="mt-1 text-sm text-cream tnum">#{order.number}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Pax</p>
          <p className="mt-1 text-sm text-cream tnum">{order.guests}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Aberta</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-cream tnum">
            <Clock3 className="size-3 text-muted" aria-hidden /> {formatTime(order.openedAt)} · {minutesSince(order.openedAt)}m
          </p>
        </div>
      </div>
      {order.notes && <p className="bg-gold/[0.06] px-5 py-2 text-[11px] text-gold-soft">{order.notes}</p>}

      <div className="px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Artigos ({order.items.filter((i) => i.status !== "void").length})</p>
          {canOperate && order.status !== "paid" && order.status !== "cancelled" && (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPicker(true)}>
              <Plus className="size-3" aria-hidden /> Adicionar
            </button>
          )}
        </div>
        <ul className="space-y-1.5">
          {order.items.length === 0 && <li className="text-xs text-muted">Sem artigos. Adicione o primeiro pedido.</li>}
          {order.items.map((item) => (
            <li
              key={item.id}
              className={cn(
                "rounded-lg border border-line bg-surface-2/50 px-3 py-2",
                item.status === "void" && "opacity-45",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("truncate text-xs text-cream", item.status === "void" && "line-through")}>
                    {item.qty}× {item.name}
                  </p>
                  {item.modifiers.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-gold-soft">{item.modifiers.map((m) => m.name).join(" · ")}</p>
                  )}
                  {item.notes && <p className="mt-0.5 text-[10px] text-muted">{item.notes}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <span className={cn("text-[10px]", item.status === "ready" ? "text-mint" : item.status === "void" ? "text-alert" : "text-muted")}>
                      {ITEM_STATUS_LABEL[item.status]}
                    </span>
                    {item.status === "ready" && canOperate && (
                      <button type="button" className="text-[10px] text-mint underline-offset-2 hover:underline" onClick={() => serve(item.id)} disabled={busy !== null}>
                        Marcar servido
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-cream tnum">{eur(item.lineTotalCents)}</span>
                  {item.status === "draft" && canOperate && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded border border-line-strong p-0.5 text-muted hover:text-cream"
                        onClick={() => updateQty(item.id, Math.max(1, item.qty - 1))}
                        aria-label={`Diminuir ${item.name}`}
                      >
                        <Minus className="size-2.5" aria-hidden />
                      </button>
                      <span className="w-4 text-center text-[10px] tnum">{item.qty}</span>
                      <button
                        type="button"
                        className="rounded border border-line-strong p-0.5 text-muted hover:text-cream"
                        onClick={() => updateQty(item.id, Math.min(20, item.qty + 1))}
                        aria-label={`Aumentar ${item.name}`}
                      >
                        <Plus className="size-2.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="ml-1 rounded border border-line-strong p-0.5 text-alert hover:bg-alert/10"
                        onClick={() => setVoidTarget({ id: item.id, name: item.name })}
                        aria-label={`Remover ${item.name}`}
                      >
                        <Trash2 className="size-2.5" aria-hidden />
                      </button>
                    </div>
                  )}
                  {item.status !== "draft" && item.status !== "void" && canManage && (
                    <button
                      type="button"
                      className="text-[10px] text-muted hover:text-alert"
                      onClick={() => setVoidTarget({ id: item.id, name: item.name })}
                    >
                      Anular
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {drafts.length > 0 && canOperate && (
          <button type="button" onClick={send} className="btn btn-gold mt-3 w-full" disabled={busy !== null}>
            {busy === "send" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
            Enviar {drafts.length} artigo{drafts.length > 1 ? "s" : ""} para a cozinha
          </button>
        )}
        {serverReady.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 rounded-md bg-mint/10 px-2 py-1.5 text-[10px] text-mint">
            <Check className="size-3" aria-hidden /> {serverReady.length} artigo(s) pronto(s) a servir.
          </p>
        )}
      </div>

      <OrderTotals order={order} canManage={canManage} onMutate={onMutate} />

      <PaymentsPanel order={order} canManage={canManage} onMutate={onMutate} />

      <div className="px-5 py-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted">Histórico</p>
        <ol className="space-y-2 border-l border-line pl-3">
          {order.events.slice(-6).reverse().map((event) => (
            <li key={event.id} className="relative text-[11px] text-muted">
              <span className="absolute -left-[17px] top-1.5 size-1.5 rounded-full bg-line-strong" aria-hidden />
              <span className="text-cream-dim">{event.detail}</span>
              <span className="ml-1.5 tnum">{formatTime(event.createdAt)}</span>
              {event.actorName && <span className="ml-1 text-[10px]">· {event.actorName}</span>}
            </li>
          ))}
          {order.events.length === 0 && <li className="text-[11px] text-muted">Sem eventos registados.</li>}
        </ol>
      </div>

      {canOperate && order.status !== "paid" && order.status !== "cancelled" && (
        <div className="flex flex-wrap gap-2 px-5 py-4">
          <button
            type="button"
            className={cn("btn btn-sm flex-1", canClose ? "btn-primary" : "btn-ghost")}
            onClick={() => setCloseOpen(true)}
            disabled={busy !== null}
          >
            <ReceiptText className="size-3.5" aria-hidden /> Fechar comanda
          </button>
          {canManage && (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setCancelOpen(true)} disabled={busy !== null}>
              Anular
            </button>
          )}
        </div>
      )}

      {order.status === "paid" && (
        <p className="flex items-center gap-2 px-5 py-4 text-xs text-mint">
          <Check className="size-3.5" aria-hidden /> Conta fechada em {formatTime(order.closedAt)} — {eur(order.totals.paidCents)} confirmados.
        </p>
      )}
      {order.status === "cancelled" && (
        <p className="flex items-center gap-2 px-5 py-4 text-xs text-alert">
          <AlertTriangle className="size-3.5" aria-hidden /> Comanda anulada.
        </p>
      )}

      <AddItemModal
        open={picker}
        onClose={() => setPicker(false)}
        orderId={order.id}
        catalog={catalog}
        onAdded={onMutate}
      />

      <Modal
        open={voidTarget !== null}
        onClose={() => {
          setVoidTarget(null);
          setReason("");
        }}
        title="Anular artigo"
        description={voidTarget ? `${voidTarget.name} — esta ação fica registada no histórico.` : undefined}
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVoidTarget(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={reason.trim().length < 3 || busy !== null}
              onClick={async () => {
                if (!voidTarget) return;
                await act(
                  "void",
                  () =>
                    api(`/api/orders/${order.id}/items/${voidTarget.id}`, {
                      method: "DELETE",
                      body: JSON.stringify({ reason }),
                    }),
                  "Artigo anulado. Stock revertido.",
                );
                setVoidTarget(null);
                setReason("");
              }}
            >
              Confirmar anulação
            </button>
          </>
        }
      >
        <label className="label" htmlFor="void-reason">
          Motivo
        </label>
        <input id="void-reason" className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Cliente desistiu, erro de lançamento..." />
      </Modal>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Anular comanda"
        description="A comanda inteira será anulada e o stock revertido. Apenas a gestão pode fazer isto."
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelOpen(false)}>
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={reason.trim().length < 3 || busy !== null}
              onClick={async () => {
                await act(
                  "cancel",
                  () => api(`/api/orders/${order.id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
                  "Comanda anulada.",
                );
                setCancelOpen(false);
                setReason("");
              }}
            >
              Anular comanda
            </button>
          </>
        }
      >
        <label className="label" htmlFor="cancel-reason">
          Motivo
        </label>
        <input id="cancel-reason" className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mesa desistiu do serviço..." />
      </Modal>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title={`Fechar comanda #${order.number}`}
        description="O fecho exige todos os artigos servidos, pagamentos confirmados e saldo zero."
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCloseOpen(false)}>
              Voltar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canClose || busy !== null}
              onClick={async () => {
                await act("close", () => api(`/api/orders/${order.id}/close`, { method: "POST" }), "Comanda fechada. Mesa em limpeza.");
                setCloseOpen(false);
              }}
            >
              Confirmar fecho
            </button>
          </>
        }
      >
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Total</dt>
            <dd className="tnum text-cream">{eur(order.totals.totalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Confirmado</dt>
            <dd className="tnum text-mint">{eur(order.totals.paidCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Saldo em falta</dt>
            <dd className={cn("tnum", order.totals.balanceCents === 0 ? "text-mint" : "text-alert")}>{eur(order.totals.balanceCents)}</dd>
          </div>
        </dl>
        {!canClose && (
          <p className="mt-3 rounded-md border border-amber/30 bg-amber/10 px-2.5 py-2 text-[11px] text-amber">
            {order.totals.balanceCents > 0
              ? "Registe e confirme os pagamentos em falta."
              : order.payments.some((p) => p.status === "recorded")
                ? "Existem pagamentos por confirmar pela gestão."
                : "Ainda há artigos por servir ou por enviar."}
          </p>
        )}
      </Modal>
    </div>
  );
}

function OrderTotals({ order, canManage, onMutate }: { order: OrderDetail; canManage: boolean; onMutate: (message?: string) => Promise<void> }) {
  const toast = useToast();
  const [discount, setDiscount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cents = Math.round(Number(discount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      toast.push("Desconto inválido.", "error");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/orders/${order.id}/discount`, { method: "POST", body: JSON.stringify({ discountCents: cents }) });
      setDiscount("");
      await onMutate("Desconto aplicado.");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Erro", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 py-4">
      <dl className="space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal (c/ IVA)</dt>
          <dd className="tnum text-cream-dim">{eur(order.totals.subtotalCents)}</dd>
        </div>
        {order.totals.discountCents > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted">Desconto</dt>
            <dd className="tnum text-gold-soft">−{eur(order.totals.discountCents)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted">IVA incluído ({Math.round((order.restaurant.taxRateBps / 100) * 100) / 100}%)</dt>
          <dd className="tnum text-muted">{eur(order.totals.taxCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Base líquida</dt>
          <dd className="tnum text-muted">{eur(order.totals.netSalesCents)}</dd>
        </div>
        {order.totals.serviceCents > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted">Serviço</dt>
            <dd className="tnum text-cream-dim">{eur(order.totals.serviceCents)}</dd>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-line pt-2">
          <dt className="text-cream">Total</dt>
          <dd className="text-base text-cream tnum">{eur(order.totals.totalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Pago / saldo</dt>
          <dd className="tnum text-muted">
            <span className="text-mint">{eur(order.totals.paidCents)}</span> / {eur(order.totals.balanceCents)}
          </dd>
        </div>
      </dl>
      {canManage && order.status !== "paid" && order.status !== "cancelled" && (
        <form onSubmit={submit} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label className="label" htmlFor={`discount-${order.id}`}>
              Desconto (€)
            </label>
            <input
              id={`discount-${order.id}`}
              className="field tnum"
              inputMode="decimal"
              placeholder="0,00"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-ghost btn-sm" disabled={busy || discount.trim() === ""}>
            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null} Aplicar
          </button>
        </form>
      )}
    </div>
  );
}

function PaymentsPanel({ order, canManage, onMutate }: { order: OrderDetail; canManage: boolean; onMutate: (message?: string) => Promise<void> }) {
  const toast = useToast();
  const [amount, setAmount] = useState((order.totals.balanceCents / 100).toFixed(2).replace(".", ","));
  const [method, setMethod] = useState<"card" | "cash" | "mbway" | "voucher" | "transfer">("card");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const idempotency = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    setAmount((order.totals.balanceCents / 100).toFixed(2).replace(".", ","));
    idempotency.current = crypto.randomUUID();
  }, [order.totals.balanceCents, order.id]);

  const record = async (event: React.FormEvent) => {
    event.preventDefault();
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.push("Valor inválido.", "error");
      return;
    }
    setBusy("record");
    try {
      await api(`/api/orders/${order.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amountCents: cents, method, reference, idempotencyKey: idempotency.current }),
      });
      idempotency.current = crypto.randomUUID();
      setReference("");
      await onMutate("Pagamento registado. Aguarda confirmação da gestão.");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Erro ao registar pagamento", "error");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (paymentId: number) => {
    setBusy(`confirm-${paymentId}`);
    try {
      await api(`/api/payments/${paymentId}/confirm`, { method: "POST" });
      await onMutate("Pagamento confirmado.");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Erro ao confirmar", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-5 py-4">
      <p className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-muted">
        Pagamentos
        <span className="normal-case tracking-normal text-muted">registo ≠ confirmação</span>
      </p>
      <ul className="space-y-1.5">
        {order.payments.length === 0 && <li className="text-[11px] text-muted">Sem pagamentos registados.</li>}
        {order.payments.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2">
            <div>
              <p className="text-xs text-cream tnum">
                {eur(payment.amountCents)} · {PAYMENT_METHOD_LABEL[payment.method]}
              </p>
              <p className="text-[10px] text-muted">
                {payment.status === "confirmed" ? `Confirmado ${formatTime(payment.confirmedAt)}` : "Registado, por confirmar"}
                {payment.reference ? ` · ${payment.reference}` : ""}
              </p>
            </div>
            {payment.status === "recorded" ? (
              canManage ? (
                <button type="button" className="btn btn-gold btn-xs" onClick={() => confirm(payment.id)} disabled={busy !== null}>
                  {busy === `confirm-${payment.id}` ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
                  Confirmar
                </button>
              ) : (
                <span className="chip border-amber/40 text-amber">Aguarda gestão</span>
              )
            ) : (
              <span className="chip border-mint/40 text-mint">Confirmado</span>
            )}
          </li>
        ))}
      </ul>

      {order.status !== "paid" && order.status !== "cancelled" && order.totals.balanceCents > 0 && (
        <form onSubmit={record} className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor={`amount-${order.id}`}>
                Valor
              </label>
              <input id={`amount-${order.id}`} className="field tnum" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor={`method-${order.id}`}>
                Método
              </label>
              <select id={`method-${order.id}`} className="field" value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
                {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`ref-${order.id}`}>
              Referência (opcional)
            </label>
            <input id={`ref-${order.id}`} className="field" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="TRX-0000" />
          </div>
          <button type="submit" className="btn btn-ghost w-full btn-sm" disabled={busy !== null}>
            {busy === "record" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <CreditCard className="size-3.5" aria-hidden />}
            Registar pagamento
          </button>
          <p className="flex items-start gap-1.5 text-[10px] text-muted">
            <Banknote className="mt-0.5 size-3 shrink-0" aria-hidden />
            Não são processados pagamentos reais: este registo é operacional e requer confirmação de gestão.
          </p>
          <p className="flex items-start gap-1.5 text-[10px] text-muted">
            <CircleDollarSign className="mt-0.5 size-3 shrink-0" aria-hidden /> Saldo: {eur(order.totals.balanceCents)} · {order.items.filter((i) => i.status === "served").length} artigos servidos
          </p>
        </form>
      )}
    </div>
  );
}

function AddItemModal({
  open,
  onClose,
  orderId,
  catalog,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  orderId: number;
  catalog: MenuCatalog;
  onAdded: (message?: string) => Promise<void>;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [modifierIds, setModifierIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return catalog.products.filter((product) => {
      if (category !== "all" && product.categorySlug !== category) return false;
      if (!product.available) return false;
      if (!term) return true;
      return product.name.toLowerCase().includes(term) || product.description.toLowerCase().includes(term);
    });
  }, [catalog.products, query, category]);

  const reset = () => {
    setSelected(null);
    setQty(1);
    setNotes("");
    setModifierIds([]);
  };

  const add = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/items`, {
        method: "POST",
        body: JSON.stringify({ productId: selected.id, qty, notes, modifierIds }),
      });
      reset();
      onClose();
      await onAdded(`${qty}× ${selected.name} adicionado.`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Erro ao adicionar", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { onClose(); reset(); }} title="Adicionar artigos" description="Produtos e preços vêm do menu gerido no painel." width="max-w-2xl">
      {!selected ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              autoFocus
              className="field pl-9"
              placeholder="Procurar produto..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Procurar produto"
            />
          </div>
          <div className="scroll-x flex gap-1.5">
            <button type="button" className={cn("chip", category === "all" && "border-gold/60 text-gold-soft")} onClick={() => setCategory("all")}>
              Tudo
            </button>
            {catalog.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={cn("chip", category === cat.slug && "border-gold/60 text-gold-soft")}
                onClick={() => setCategory(cat.slug)}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <ul className="scroll-area max-h-[46vh] space-y-1.5">
            {filtered.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => setSelected(product)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-left transition hover:border-gold/40"
                >
                  <span>
                    <span className="block text-xs text-cream">{product.name}</span>
                    <span className="block text-[10px] text-muted">{product.categoryName} · {product.prepMinutes} min</span>
                  </span>
                  <span className="text-xs text-cream tnum">{eur(product.priceCents)}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="py-6 text-center text-xs text-muted">Sem resultados disponíveis.</li>}
          </ul>
        </div>
      ) : (
        <div className="space-y-3">
          <button type="button" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-cream" onClick={reset}>
            <ChevronLeft className="size-3" aria-hidden /> Voltar à lista
          </button>
          <div className="rounded-lg border border-line bg-surface-2/60 p-3">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-lg text-cream">{selected.name}</p>
              <p className="text-sm text-cream tnum">{eur(selected.priceCents)}</p>
            </div>
            <p className="mt-1 text-[11px] text-muted">{selected.description}</p>
            {selected.allergens.length > 0 && (
              <p className="mt-2 text-[10px] text-amber">Alergénios: {selected.allergens.join(", ")}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Quantidade</label>
              <div className="flex items-center gap-2">
                <button type="button" className="btn btn-ghost btn-xs !p-1.5" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Menos">
                  <Minus className="size-3" aria-hidden />
                </button>
                <span className="w-8 text-center text-sm tnum">{qty}</span>
                <button type="button" className="btn btn-ghost btn-xs !p-1.5" onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="Mais">
                  <Plus className="size-3" aria-hidden />
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="item-notes">
                Observações
              </label>
              <input id="item-notes" className="field" value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 280))} placeholder="Sem cebola..." />
            </div>
          </div>
          <div>
            <label className="label">Extras e preferências</label>
            <div className="flex flex-wrap gap-1.5">
              {catalog.modifiers.map((modifier) => {
                const active = modifierIds.includes(modifier.id);
                return (
                  <button
                    key={modifier.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setModifierIds((ids) => (active ? ids.filter((id) => id !== modifier.id) : [...ids, modifier.id]))
                    }
                    className={cn("chip transition", active ? "border-gold/60 bg-gold/10 text-gold-soft" : "hover:text-cream")}
                  >
                    {modifier.name}
                    {modifier.priceDeltaCents > 0 ? ` +${eur(modifier.priceDeltaCents)}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface-3 px-3 py-2">
            <span className="text-xs text-muted">Linha</span>
            <span className="text-sm text-cream tnum">
              {eur((selected.priceCents + modifierIds.reduce((sum, id) => sum + (catalog.modifiers.find((m) => m.id === id)?.priceDeltaCents ?? 0), 0)) * qty)}
            </span>
          </div>
          <button type="button" className="btn btn-gold w-full" onClick={add} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
            Adicionar {qty}× {selected.name}
          </button>
        </div>
      )}
    </Modal>
  );
}
