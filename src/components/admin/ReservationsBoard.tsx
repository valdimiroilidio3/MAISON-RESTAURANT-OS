"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { CalendarPlus, Check, Loader2, Phone, UserRound, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDatePT, generateSlots } from "@/lib/reservations-rules";
import { RESERVATION_STATUS_META } from "@/lib/status";
import { localDate } from "@/lib/dates";
import { idleAction, type ActionState } from "@/lib/action-types";
import type { Reservation, ReservationStatus, TableSummary } from "@/lib/types";
import {
  assignReservationTableAction,
  createAdminReservationAction,
  updateReservationStatusAction,
} from "@/app/actions/reservations";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReservationStatusBadge } from "@/components/ui/StatusBadge";

interface DayStat {
  date: string;
  total: number;
  pending: number;
  covers: number;
  seated: number;
}

const FILTERS: { key: ReservationStatus | "all"; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "confirmed", label: "Confirmadas" },
  { key: "seated", label: "Sentadas" },
  { key: "cancelled", label: "Canceladas" },
  { key: "no_show", label: "Não compareceu" },
];

const TRANSITIONS: { status: ReservationStatus; label: string; icon: typeof Check; tone: string }[] = [
  { status: "confirmed", label: "Confirmar", icon: Check, tone: "text-gold" },
  { status: "seated", label: "Sentar", icon: UserRound, tone: "text-mint" },
  { status: "completed", label: "Concluir", icon: Check, tone: "text-muted" },
  { status: "no_show", label: "Não veio", icon: X, tone: "text-alert" },
  { status: "cancelled", label: "Cancelar", icon: X, tone: "text-alert" },
];

export function ReservationsBoard({
  reservations,
  tables,
  date,
  days,
  stats,
}: {
  reservations: Reservation[];
  tables: Pick<TableSummary, "id" | "code" | "seats" | "zoneName" | "status">[];
  date: string;
  days: string[];
  stats: DayStat[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<ReservationStatus | "all">("all");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const today = localDate(0);
  const current = stats.find((s) => s.date === date);

  const visible = reservations.filter((reservation) => (filter === "all" ? true : reservation.status === filter));

  const changeStatus = async (reservation: Reservation, status: ReservationStatus) => {
    setBusy(`${reservation.id}-${status}`);
    const formData = new FormData();
    formData.set("reservationId", String(reservation.id));
    formData.set("status", status);
    try {
      const result = await updateReservationStatusAction(formData);
      toast.push(result.message, result.ok ? "success" : "error");
      if (result.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="scroll-x flex gap-1.5">
          {days.map((day) => {
            const info = stats.find((s) => s.date === day);
            const active = day === date;
            return (
              <Link
                key={day}
                href={`/admin/reservas?date=${day}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-[76px] flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-center transition",
                  active ? "border-gold/60 bg-gold/10" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className={cn("text-[10px] uppercase tracking-[0.1em]", active ? "text-gold-soft" : "text-muted")}>
                  {day === today ? "Hoje" : formatDatePT(day).split(",")[0]}
                </span>
                <span className="text-sm text-cream tnum">{day.slice(8, 10)}/{day.slice(5, 7)}</span>
                <span className="text-[10px] text-muted tnum">
                  {info?.total ?? 0} res · {info?.covers ?? 0} pax
                </span>
                {(info?.pending ?? 0) > 0 && <span className="status-dot bg-amber" aria-label={`${info?.pending} pendentes`} />}
              </Link>
            );
          })}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <CalendarPlus className="size-3.5" aria-hidden /> Nova reserva
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Reservas", value: current?.total ?? 0 },
          { label: "Por confirmar", value: current?.pending ?? 0, tone: "text-amber" },
          { label: "Covers confirmados", value: current?.covers ?? 0, tone: "text-mint" },
          { label: "Sentadas", value: current?.seated ?? 0, tone: "text-gold" },
        ].map((kpi) => (
          <div key={kpi.label} className="panel px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{kpi.label}</p>
            <p className={cn("mt-1 font-display text-2xl tnum", kpi.tone ?? "text-cream")}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={cn("chip transition", filter === item.key ? "border-gold/60 bg-gold/10 text-gold-soft" : "hover:text-cream")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm text-cream">{formatDatePT(date)}</h2>
          <span className="text-[11px] text-muted">{visible.length} reservas · turnos 12:00–14:30 e 19:00–22:00</span>
        </header>
        {visible.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={CalendarPlus} title="Sem reservas" description="Crie uma reserva ou ajuste os filtros." action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>Nova reserva</button>} />
          </div>
        ) : (
          <ul className="divide-y divide-line/70">
            {visible.map((reservation) => (
              <li key={reservation.id} className="table-row-hover px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="w-12 shrink-0 font-display text-lg text-cream tnum">{reservation.time}</span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-cream">
                        {reservation.customerName}
                        <span className="chip text-[10px] tnum">{reservation.partySize} pax</span>
                        <span className="text-[10px] text-muted">{reservation.code}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                        <span className="inline-flex items-center gap-1"><Phone className="size-2.5" aria-hidden /> {reservation.customerPhone}</span>
                        <span>{reservation.customerEmail}</span>
                        <span className="uppercase tracking-[0.08em]">{reservation.source}</span>
                      </p>
                      {reservation.note && <p className="mt-1 rounded border border-gold/20 bg-gold/[0.05] px-2 py-1 text-[10px] text-gold-soft">{reservation.note}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <ReservationStatusBadge status={reservation.status} />
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {TRANSITIONS.filter((transition) => {
                        const allowed: Record<ReservationStatus, ReservationStatus[]> = {
                          pending: ["confirmed", "cancelled", "no_show"],
                          confirmed: ["seated", "cancelled", "no_show"],
                          seated: ["completed"],
                          completed: [],
                          cancelled: [],
                          no_show: [],
                        };
                        return allowed[reservation.status].includes(transition.status);
                      }).map((transition) => (
                        <button
                          key={transition.status}
                          type="button"
                          className={cn("btn btn-ghost btn-xs", transition.tone)}
                          disabled={busy !== null}
                          onClick={() => changeStatus(reservation, transition.status)}
                          aria-label={`${transition.label} ${reservation.customerName}`}
                        >
                          {busy === `${reservation.id}-${transition.status}` ? (
                            <Loader2 className="size-3 animate-spin" aria-hidden />
                          ) : (
                            <transition.icon className="size-3" aria-hidden />
                          )}
                          {transition.label}
                        </button>
                      ))}
                    </div>
                    {!["cancelled", "completed", "no_show"].includes(reservation.status) && (
                      <AssignTable reservation={reservation} tables={tables} onDone={() => router.refresh()} />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NewReservationModal
        open={creating}
        onClose={() => setCreating(false)}
        date={date}
        tables={tables}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}

function AssignTable({
  reservation,
  tables,
  onDone,
}: {
  reservation: Reservation;
  tables: Pick<TableSummary, "id" | "code" | "seats" | "zoneName" | "status">[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [tableId, setTableId] = useState(reservation.tableId ?? "");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!tableId) return;
    setPending(true);
    const formData = new FormData();
    formData.set("reservationId", String(reservation.id));
    formData.set("tableId", String(tableId));
    try {
      const result = await assignReservationTableAction(formData);
      toast.push(result.message, result.ok ? "success" : "error");
      if (result.ok) onDone();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={tableId}
        onChange={(event) => setTableId(event.target.value)}
        className="field h-7 w-auto min-w-[132px] py-0 text-[11px]"
        aria-label={`Mesa para reserva de ${reservation.customerName}`}
      >
        <option value="">Mesa —</option>
        {tables.map((table) => (
          <option key={table.id} value={table.id}>
            {table.code} · {table.seats}p · {table.zoneName}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-ghost btn-xs" onClick={submit} disabled={!tableId || pending}>
        {pending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
      </button>
    </div>
  );
}

function NewReservationModal({
  open,
  onClose,
  date,
  tables,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  tables: Pick<TableSummary, "id" | "code" | "seats" | "zoneName" | "status">[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await createAdminReservationAction(previous, formData);
      if (result.ok) {
        toast.push(result.message, "success");
        onCreated();
        onClose();
      }
      return result;
    },
    idleAction,
  );

  useEffect(() => {
    if (!open) return;
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Nova reserva" description="A mesa é proposta automaticamente se não escolher uma.">
      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="res-name">
              Nome
            </label>
            <input id="res-name" name="name" required className="field" />
          </div>
          <div>
            <label className="label" htmlFor="res-email">
              Email
            </label>
            <input id="res-email" name="email" type="email" required className="field" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="res-phone">
              Telefone
            </label>
            <input id="res-phone" name="phone" required className="field" placeholder="+351 ..." />
          </div>
          <div>
            <label className="label" htmlFor="res-party">
              Pessoas
            </label>
            <input id="res-party" name="partySize" type="number" min={1} max={10} defaultValue={2} required className="field tnum" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="res-date">
              Data
            </label>
            <input id="res-date" name="date" type="date" defaultValue={date} required className="field tnum" />
          </div>
          <div>
            <label className="label" htmlFor="res-time">
              Hora
            </label>
            <select id="res-time" name="time" defaultValue="20:00" className="field">
              {generateSlots().map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="res-table">
              Mesa (opcional)
            </label>
            <select id="res-table" name="tableId" className="field">
              <option value="">Automática</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.code} · {table.seats}p
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="res-note">
            Nota interna
          </label>
          <input id="res-note" name="note" className="field" placeholder="Alergias, ocasião, preferências..." />
        </div>
        {state.message && !state.ok && (
          <p role="alert" className="rounded-md border border-alert/30 bg-alert/10 px-3 py-2 text-xs text-alert">
            {state.message}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Criar reserva
          </button>
        </div>
      </form>
    </Modal>
  );
}
