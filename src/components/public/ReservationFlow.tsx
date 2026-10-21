"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  Phone,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { addDaysToDateString, formatDateLongPT, formatDatePT } from "@/lib/reservations-rules";

interface Slot {
  time: string;
  remaining: number;
}

interface Availability {
  date: string;
  partySize: number;
  slots: Slot[];
  nextDates: string[];
}

interface Confirmation {
  code: string;
  date: string;
  time: string;
  partySize: number;
  table: string;
  status: string;
}

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function ReservationFlow({ phone, maxParty = 10 }: { phone: string; maxParty?: number }) {
  const today = useMemo(localToday, []);
  const days = useMemo(() => Array.from({ length: 14 }).map((_, i) => addDaysToDateString(today, i)), [today]);

  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [step, setStep] = useState<"when" | "details" | "done">("when");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const loadSlots = useCallback(
    async (targetDate: string, party: number) => {
      setLoadingSlots(true);
      setSlotsError(null);
      setTime(null);
      try {
        const response = await fetch(`/api/availability?date=${targetDate}&partySize=${party}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível consultar a disponibilidade.");
        setAvailability(payload as Availability);
      } catch (err) {
        setSlotsError(err instanceof Error ? err.message : "Erro de rede.");
        setAvailability(null);
      } finally {
        setLoadingSlots(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (step === "done") return;
    void loadSlots(date, partySize);
  }, [date, partySize, loadSlots, step]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!time) {
      setError("Escolha uma hora.");
      return;
    }
    if (!consent) {
      setError("É necessário aceitar a política de reservas.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: customerPhone, date, time, partySize, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível concluir a reserva.");
      setConfirmation(payload as Confirmation);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done" && confirmation) {
    const pending = confirmation.status === "pending";
    return (
      <div className="panel p-6 sm:p-8">
        <div className="flex size-11 items-center justify-center rounded-full border border-mint/40 bg-mint/10">
          <Check className="size-5 text-mint" aria-hidden />
        </div>
        <h2 className="mt-5 font-display text-3xl text-cream">Reserva registada.</h2>
        <p className="mt-2 text-sm text-muted">
          {pending
            ? "A equipa vai confirmar a sua reserva. Guarde o código abaixo."
            : "A sua mesa está confirmada."}
        </p>
        <dl className="mt-6 space-y-2 border-t border-line pt-5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Código</dt>
            <dd className="text-gold-soft tnum">{confirmation.code}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Data</dt>
            <dd className="text-cream">{formatDateLongPT(confirmation.date)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Hora</dt>
            <dd className="text-cream tnum">{confirmation.time}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Pessoas</dt>
            <dd className="text-cream tnum">{confirmation.partySize}</dd>
          </div>
          {confirmation.table && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Mesa</dt>
              <dd className="text-cream">{confirmation.table}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Estado</dt>
            <dd className={pending ? "text-amber" : "text-mint"}>{pending ? "Pendente de confirmação" : "Confirmada"}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setStep("when");
              setConfirmation(null);
              setConsent(false);
              setNote("");
            }}
          >
            Nova reserva
          </button>
          <Link href="/menu" className="btn btn-primary btn-sm">
            Ver o menu
          </Link>
        </div>
        <p className="mt-5 border-t border-line pt-4 text-[10px] leading-relaxed text-muted">
          Nesta demonstração não é enviado email de confirmação (integração de email não configurada). Em produção, a
          confirmação é enviada para {email}.
        </p>
      </div>
    );
  }

  return (
    <div className="panel p-5 sm:p-7">
      <ol className="mb-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em]">
        <li className={cn("flex items-center gap-1.5", step === "when" ? "text-gold-soft" : "text-muted")}>
          <span className={cn("flex size-4 items-center justify-center rounded-full border text-[9px]", step === "when" ? "border-gold text-gold" : "border-line-strong")}>1</span>
          Data e hora
        </li>
        <li className="h-px flex-1 bg-line" aria-hidden />
        <li className={cn("flex items-center gap-1.5", step === "details" ? "text-gold-soft" : "text-muted")}>
          <span className={cn("flex size-4 items-center justify-center rounded-full border text-[9px]", step === "details" ? "border-gold text-gold" : "border-line-strong")}>2</span>
          Contacto
        </li>
      </ol>

      {step === "when" ? (
        <div className="space-y-5">
          <div>
            <p className="label">Pessoas</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: maxParty }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={partySize === i + 1}
                  onClick={() => setPartySize(i + 1)}
                  className={cn(
                    "size-9 rounded-full border text-xs tnum transition",
                    partySize === i + 1 ? "border-gold bg-gold text-ink" : "border-line-strong text-cream-dim hover:border-gold/50",
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted">
              Grupos com mais de {maxParty} pessoas: fale com a equipa pelo <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-gold-soft underline-offset-2 hover:underline">{phone}</a>.
            </p>
          </div>

          <div>
            <p className="label">Data</p>
            <div className="scroll-x flex gap-1.5 pb-1">
              {days.slice(0, 10).map((day) => {
                const active = day === date;
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDate(day)}
                    className={cn(
                      "flex min-w-[62px] flex-col items-center rounded-lg border px-2 py-2 text-center transition",
                      active ? "border-gold bg-gold/10" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span className={cn("text-[9px] uppercase tracking-[0.1em]", active ? "text-gold-soft" : "text-muted")}>
                      {day === today ? "Hoje" : formatDatePT(day).split(",")[0]}
                    </span>
                    <span className="mt-0.5 text-sm text-cream tnum">{day.slice(8, 10)}</span>
                    <span className="text-[9px] text-muted tnum">{formatDatePT(day).split(" ").slice(-1)}</span>
                  </button>
                );
              })}
            </div>
            <label className="mt-2 flex items-center gap-2 text-[10px] text-muted">
              <CalendarDays className="size-3" aria-hidden />
              Outra data
              <input
                type="date"
                value={date}
                min={today}
                max={addDaysToDateString(today, 60)}
                onChange={(event) => setDate(event.target.value || today)}
                className="field h-7 w-auto py-0 text-[11px] tnum"
                aria-label="Escolher outra data"
              />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="label">Hora</p>
              <span className="text-[10px] text-muted">Almoço 12:00–14:30 · Jantar 19:00–22:00</span>
            </div>
            {loadingSlots ? (
              <div className="flex flex-wrap gap-1.5" aria-live="polite" aria-busy="true">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="skeleton h-8 w-14" />
                ))}
              </div>
            ) : slotsError ? (
              <div className="rounded-lg border border-alert/30 bg-alert/10 px-3 py-3 text-xs text-alert">
                {slotsError}
                <button type="button" className="ml-2 underline" onClick={() => loadSlots(date, partySize)}>
                  tentar novamente
                </button>
              </div>
            ) : availability && availability.slots.length === 0 ? (
              <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-3 text-xs text-muted">
                Sem horários para {formatDatePT(date)} com {partySize} pessoas.
                {availability.nextDates.length > 0 && (
                  <button
                    type="button"
                    className="ml-1 text-gold-soft underline-offset-2 hover:underline"
                    onClick={() => setDate(availability.nextDates[1] ?? availability.date)}
                  >
                    Ver {formatDatePT(availability.nextDates[1] ?? availability.date)}
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Horários disponíveis">
                {availability?.slots.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    aria-pressed={time === slot.time}
                    onClick={() => setTime(slot.time)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs tnum transition",
                      time === slot.time ? "border-gold bg-gold text-ink" : "border-line-strong text-cream-dim hover:border-gold/50",
                    )}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 flex items-center gap-1 text-[10px] text-muted">
              <Clock3 className="size-3" aria-hidden /> A sua mesa fica reservada por 90 minutos. Tolerância de 15 minutos.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              <UsersRound className="size-3.5" aria-hidden /> {partySize} {partySize === 1 ? "pessoa" : "pessoas"} · {formatDatePT(date)} {time ?? "—"}
            </span>
            <button type="button" className="btn btn-primary btn-sm" disabled={!time} onClick={() => setStep("details")}>
              Continuar <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <button type="button" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted hover:text-cream" onClick={() => setStep("when")}>
            <ArrowLeft className="size-3" aria-hidden /> Alterar data
          </button>
          <div className="flex items-center justify-between rounded-lg border border-gold/25 bg-gold/[0.06] px-3 py-2 text-[11px]">
            <span className="text-cream">{formatDatePT(date)} · {time}</span>
            <span className="text-gold-soft">{partySize} pax</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="res-name">
                Nome
              </label>
              <input id="res-name" required value={name} onChange={(event) => setName(event.target.value)} className="field" autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="res-phone">
                Telefone
              </label>
              <input
                id="res-phone"
                required
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                className="field"
                autoComplete="tel"
                placeholder="+351 ..."
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="res-email">
              Email
            </label>
            <input
              id="res-email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="label" htmlFor="res-note">
              Nota (opcional)
            </label>
            <textarea
              id="res-note"
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 400))}
              rows={2}
              className="field resize-none"
              placeholder="Alergias, ocasião especial, cadeira de bebé..."
            />
          </div>
          <label className="flex items-start gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 size-3.5 accent-[#C6A66B]"
              required
            />
            Aceito a política de reservas: cancelamento até 4 horas antes, tolerância de 15 minutos e tratamento dos
            dados apenas para gestão da reserva.
          </label>
          {error && (
            <p role="alert" className="rounded-md border border-alert/30 bg-alert/10 px-3 py-2 text-xs text-alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Confirmar reserva
          </button>
          <p className="flex items-center justify-center gap-1.5 text-[10px] text-muted">
            <Phone className="size-3" aria-hidden /> Prefere falar? {phone}
          </p>
        </form>
      )}
    </div>
  );
}
