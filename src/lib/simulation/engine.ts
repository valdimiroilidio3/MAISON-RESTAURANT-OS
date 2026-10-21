/**
 * Live restaurant simulation.
 *
 * The engine advances restaurant-local time (Europe/Lisbon wall clock, without
 * DST jumps inside one service) and drives guests, tables, the kitchen pass and
 * the floor staff. It is deterministic for a given seed and has no browser or
 * database dependencies, so the same rules can be unit tested.
 */

import { chairSlots, tableDimensions } from "@/lib/floor-geometry";
import { LANDMARKS, NavGrid, type Point } from "./path";
import type {
  Course,
  PartyState,
  PaymentMethod,
  PaymentMode,
  Phase,
  SimActor,
  SimClock,
  SimEvent,
  SimParty,
  SimProduct,
  SimStaff,
  SimStats,
  SimTable,
  TaskKind,
} from "./types";

const MINUTES_PER_DAY = 1_440;
const WALK_M_PER_MIN = 74; // ~1.25 m/s
const LAST_SEATING_BEFORE_CLOSE = 30;

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const OPENING = {
  lunch: { start: 12 * 60, close: 15 * 60 },
  dinner: { start: 19 * 60, close: 23 * 60 },
  prepMorning: 11 * 60,
  prepEvening: 18 * 60,
};

export interface SimulationOptions {
  tables: SimTable[];
  products: SimProduct[];
  /** Restaurant-local weekday (0 = Sunday) to start on. */
  startWeekday: number;
  /** Minutes after midnight, local time. */
  startMinutes: number;
  /** ISO date (yyyy-mm-dd) for display, advanced as the clock rolls over. */
  startDate: string;
  seed?: number;
  /** Guests arrive about every two minutes of restaurant time. */
  arrivalMinutes?: number;
  speed?: number;
}

export interface PhaseInfo {
  phase: Phase;
  label: string;
  detail: string;
  isOpen: boolean;
  lastSeating: boolean;
  nextOpening: { weekday: number; minutes: number };
}

export interface SimSnapshot {
  clock: SimClock;
  phase: PhaseInfo;
  stats: SimStats;
  events: SimEvent[];
  parties: Array<{
    id: string;
    tableId: number;
    tableCode: string;
    size: number;
    state: PartyState;
    totalCents: number;
    paymentMode: PaymentMode;
    paymentMethod: PaymentMethod;
    course: Course | null;
  }>;
  tables: Array<{ id: number; code: string; status: TableVisualState; partyId: string | null; zoneName: string }>;
  staff: Array<{ id: string; name: string; role: SimStaff["role"]; shift: SimStaff["shift"]; task: TaskKind | null }>;
  dayLight: number;
  speed: number;
  paused: boolean;
}

export type TableVisualState = "free" | "reserved" | "seated" | "eating" | "paying" | "cleaning";

interface Route {
  points: Point[];
  onDone?: () => void;
}

interface TableRuntime {
  table: SimTable;
  seats: ReturnType<typeof chairSlots>;
  status: TableVisualState;
  partyId: string | null;
  cleaningUntil: number;
  reservedFor: string | null;
}

interface WaiterRuntime extends SimStaff {
  actor: SimActor;
  busyUntil: number;
  routeDone: boolean;
}

const MENU_FALLBACK: SimProduct[] = [
  { id: 1, name: "Prato do dia", priceCents: 1850, category: "Pratos" },
  { id: 2, name: "Entrada", priceCents: 900, category: "Entradas" },
  { id: 3, name: "Sobremesa", priceCents: 700, category: "Sobremesas" },
  { id: 4, name: "Vinho a copo", priceCents: 550, category: "Bar" },
];

export class Simulation {
  readonly tables: TableRuntime[] = [];
  readonly actors: SimActor[] = [];
  readonly parties = new Map<string, SimParty>();
  private readonly staff: WaiterRuntime[] = [];
  private readonly routes = new Map<string, Route>();
  private readonly nav: NavGrid;
  private readonly products: SimProduct[];
  private rng: () => number;

  private minute: number;
  private dayOffset = 0;
  private weekday: number;
  private date: string;
  private absMinute: number;
  private nextArrivalAt: number;
  private waitingParties: string[] = [];
  private events: SimEvent[] = [];
  private eventId = 1;
  private partySeq = 0;
  private stats: SimStats = emptyStats();
  private phaseCache: { key: string; info: PhaseInfo } | null = null;
  private lastPhase: Phase = "closed";
  private breakLogged = false;
  private initialised = false;
  private readonly arrivalMinutes: number;
  private ticketSum = 0;
  private ticketsPaid = 0;

  speed: number;
  paused = false;

  constructor(options: SimulationOptions) {
    this.minute = options.startMinutes;
    this.weekday = options.startWeekday;
    this.date = options.startDate;
    this.absMinute = this.minute;
    this.arrivalMinutes = options.arrivalMinutes ?? 2;
    this.speed = options.speed ?? 6;
    this.products = options.products.length > 0 ? options.products : MENU_FALLBACK;
    this.rng = mulberry32(options.seed ?? 20261021);
    this.nav = new NavGrid(options.tables);

    for (const table of options.tables) {
      this.tables.push({
        table,
        seats: chairSlots(table, table.id),
        status: "free",
        partyId: null,
        cleaningUntil: 0,
        reservedFor: null,
      });
    }

    this.nextArrivalAt = this.absMinute + 1;
    this.stats.tablesTotal = options.tables.length;

    this.addActor({
      id: "host",
      kind: "host",
      name: "Inês",
      x: LANDMARKS.host.x,
      z: LANDMARKS.host.z,
      rotation: Math.PI * 0.85,
      pose: "stand",
      hidden: false,
      seed: 11,
      stride: 0,
      carrying: "none",
      plate: null,
      glass: 0,
      bathroomIn: null,
      inBathroom: false,
    });
    this.staff.push({
      id: "host",
      name: "Inês",
      role: "host",
      actorId: "host",
      task: null,
      shift: "on",
      actor: this.actor("host")!,
      busyUntil: 0,
      routeDone: true,
    });

    const waiters: Array<[string, string, number, Point]> = [
      ["waiter-1", "Diogo", 21, { x: 7.6, z: -2.6 }],
      ["waiter-2", "Rui", 22, { x: -1.6, z: 1.2 }],
      ["runner", "Marta", 23, { x: 3.1, z: -6.2 }],
    ];
    for (const [id, name, seed, home] of waiters) {
      const actor: SimActor = {
        id,
        kind: id === "runner" ? "runner" : "waiter",
        name,
        x: home.x,
        z: home.z,
        rotation: 0,
        pose: "stand",
        hidden: false,
        seed,
        stride: 0,
        carrying: "none",
        plate: null,
        glass: 0,
        bathroomIn: null,
        inBathroom: false,
      };
      this.actors.push(actor);
      this.staff.push({
        id,
        name,
        role: id === "runner" ? "runner" : "waiter",
        actorId: id,
        task: null,
        shift: "on",
        actor,
        busyUntil: 0,
        routeDone: true,
      });
    }

    // Kitchen brigade — visible through the pass, never leaves the kitchen.
    this.actors.push({
      id: "chef",
      kind: "chef",
      name: "Sofia",
      x: LANDMARKS.kitchen.x,
      z: LANDMARKS.kitchen.z,
      rotation: 0.2,
      pose: "cook",
      hidden: false,
      seed: 31,
      stride: 0,
      carrying: "none",
      plate: null,
      glass: 0,
      bathroomIn: null,
      inBathroom: false,
    });
    this.actors.push({
      id: "sous",
      kind: "chef",
      name: "Marta",
      x: LANDMARKS.kitchen.x + 1.4,
      z: LANDMARKS.kitchen.z - 0.3,
      rotation: -0.3,
      pose: "cook",
      hidden: false,
      seed: 32,
      stride: 0,
      carrying: "none",
      plate: null,
      glass: 0,
      bathroomIn: null,
      inBathroom: false,
    });
  }

  /* ------------------------------------------------------------------ time */

  get clock(): SimClock {
    return { minutes: this.minute, weekday: this.weekday, date: this.date };
  }

  get dayLight(): number {
    // 0 = noite cerrada, 1 = dia pleno. Lisbon sunrise ~07:00, sunset ~19:30.
    const m = this.minute;
    if (m < 6.5 * 60 || m > 21.5 * 60) return 0;
    if (m < 8.5 * 60) return (m - 6.5 * 60) / (2 * 60);
    if (m < 18.5 * 60) return 1;
    return Math.max(0, (21.5 * 60 - m) / (3 * 60));
  }

  get phaseInfo(): PhaseInfo {
    const key = `${this.weekday}:${Math.floor(this.minute)}`;
    if (this.phaseCache?.key === key) return this.phaseCache.info;
    const info = this.computePhase();
    this.phaseCache = { key, info };
    return info;
  }

  private computePhase(): PhaseInfo {
    const minutes = this.minute;
    const weekday = this.weekday;
    if (weekday === 1 || weekday === 2) {
      return {
        phase: "closed",
        label: "Fechado",
        detail: `${weekdayLabel(weekday)} é dia de descanso da equipa.`,
        isOpen: false,
        lastSeating: false,
        nextOpening: nextOpening(weekday, minutes),
      };
    }
    if (minutes < OPENING.prepMorning) {
      return {
        phase: "closed",
        label: "Fechado",
        detail: "A casa abre às 12:00 para o almoço.",
        isOpen: false,
        lastSeating: false,
        nextOpening: nextOpening(weekday, minutes),
      };
    }
    if (minutes < OPENING.lunch.start) {
      return {
        phase: "prep",
        label: "Preparação",
        detail: "Mise en place, pão no forno e mesas montadas.",
        isOpen: false,
        lastSeating: false,
        nextOpening: { weekday, minutes: OPENING.lunch.start },
      };
    }
    if (minutes < OPENING.lunch.close) {
      return {
        phase: "lunch",
        label: "Serviço de almoço",
        detail: minutes >= OPENING.lunch.close - LAST_SEATING_BEFORE_CLOSE ? "Últimas entradas." : "Cozinha a pleno.",
        isOpen: true,
        lastSeating: minutes >= OPENING.lunch.close - LAST_SEATING_BEFORE_CLOSE,
        nextOpening: { weekday, minutes: OPENING.lunch.start },
      };
    }
    if (minutes < OPENING.prepEvening) {
      return {
        phase: "break",
        label: "Pausa entre serviços",
        detail: "Equipa em pausa. Reabrimos às 19:00 para o jantar.",
        isOpen: false,
        lastSeating: false,
        nextOpening: { weekday, minutes: OPENING.prepEvening },
      };
    }
    if (minutes < OPENING.dinner.start) {
      return {
        phase: "prep",
        label: "Preparação",
        detail: "Brasa acesa, serviço de sala reunido antes do jantar.",
        isOpen: false,
        lastSeating: false,
        nextOpening: { weekday, minutes: OPENING.dinner.start },
      };
    }
    if (minutes < OPENING.dinner.close) {
      return {
        phase: "dinner",
        label: "Serviço de jantar",
        detail: minutes >= OPENING.dinner.close - LAST_SEATING_BEFORE_CLOSE ? "Últimas entradas." : "Sala cheia, ritmo de jantar.",
        isOpen: true,
        lastSeating: minutes >= OPENING.dinner.close - LAST_SEATING_BEFORE_CLOSE,
        nextOpening: { weekday, minutes: OPENING.dinner.start },
      };
    }
    return {
      phase: "closing",
      label: "Fecho",
      detail: "Últimos pagamentos, louça na máquina e luzes a baixar.",
      isOpen: false,
      lastSeating: false,
      nextOpening: nextOpening(weekday, minutes),
    };
  }

  setSpeed(speed: number) {
    this.speed = Math.min(360, Math.max(0.5, speed));
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  jumpTo(minutes: number) {
    const target = Math.max(0, Math.min(MINUTES_PER_DAY - 1, minutes));
    // Clearing the room keeps jumps coherent (no guests mid-air at 03:00).
    this.resetRoomState();
    this.minute = target;
    this.absMinute = this.dayOffset * MINUTES_PER_DAY + target;
    this.nextArrivalAt = this.absMinute + 0.6;
    this.lastPhase = this.phaseInfo.phase;
    this.events = [];
    this.log("phase", `Relógio ajustado para as ${formatMinutes(target)}.`);
  }

  /** Move to the next service opening (used on first mount and by the UI). */
  skipToNextService() {
    if (this.phaseInfo.isOpen) {
      this.jumpTo(Math.min(this.minute + 5, this.phaseInfo.phase === "dinner" ? 22 * 60 : 14 * 60));
      return;
    }
    const target = this.phaseInfo.nextOpening;
    if (target.weekday === this.weekday && target.minutes > this.minute) {
      this.jumpTo(target.minutes);
      return;
    }
    this.jumpTo(11 * 60 + 50);
  }

  reset(seed = 20261021) {
    this.parties.clear();
    this.resetRoomState();
    this.events = [];
    this.stats = emptyStats();
    this.partySeq = 0;
    this.ticketSum = 0;
    this.ticketsPaid = 0;
    this.dayOffset = 0;
    this.minute = 11 * 60 + 35;
    this.absMinute = this.minute;
    this.nextArrivalAt = this.absMinute + 0.7;
    this.breakLogged = false;
    this.lastPhase = "closed";
    this.rng = mulberry32(seed);
  }

  private resetRoomState() {
    for (const route of this.routes.values()) route.onDone = undefined;
    this.routes.clear();
    for (const t of this.tables) {
      t.status = "free";
      t.partyId = null;
      t.cleaningUntil = 0;
      t.reservedFor = null;
    }
    for (const party of this.parties.values()) {
      for (const guestId of party.guests) {
        const guest = this.actor(guestId);
        if (guest) {
          guest.hidden = true;
          guest.plate = null;
          guest.glass = 0;
        }
      }
    }
    this.parties.clear();
    this.waitingParties = [];
    for (const staff of this.staff) {
      staff.task = null;
      staff.busyUntil = 0;
    }
  }

  /* ------------------------------------------------------------------ tick */

  tick(realMs: number) {
    if (this.paused || realMs <= 0) return;
    const minutes = (realMs / 60_000) * this.speed;
    let remaining = Math.min(minutes, 30);
    while (remaining > 0) {
      const step = Math.min(remaining, 0.2);
      this.step(step);
      remaining -= step;
    }
  }

  private step(dt: number) {
    this.advanceClock(dt);
    this.syncPhase();
    this.moveActors(dt);
    this.updateStaff(dt);
    this.updateParties(dt);
    this.updateBathrooms(dt);
    this.updateArrivals(dt);
    this.updateTableCleaning();
    this.updateTables();
  }

  private advanceClock(dt: number) {
    this.minute += dt;
    this.absMinute += dt;
    if (this.minute >= MINUTES_PER_DAY) {
      this.minute -= MINUTES_PER_DAY;
      this.dayOffset += 1;
      this.weekday = (this.weekday + 1) % 7;
      this.date = addDays(this.date, 1);
      this.nextArrivalAt = Math.max(this.nextArrivalAt, this.dayOffset * MINUTES_PER_DAY + this.minute + 0.5);
      this.breakLogged = false;
      this.log("phase", `Novo dia · ${weekdayLabel(this.weekday)}.`);
    }
  }

  private syncPhase() {
    const phase = this.phaseInfo.phase;
    if (phase === this.lastPhase) return;
    this.lastPhase = phase;
    if (phase === "prep") this.log("staff", "Equipa em preparação: mesas montadas e mise en place pronta.");
    if (phase === "lunch") this.log("phase", "Abrimos para o almoço. Boas-vindas à MAISON.");
    if (phase === "dinner") this.log("phase", "Abrimos para o jantar. Serviço a começar.");
    if (phase === "break") {
      if (!this.breakLogged) {
        this.breakLogged = true;
        this.log("staff", "Pausa entre serviços: a equipa recupera e a sala é reposta.");
      }
    }
    if (phase === "closing") this.log("phase", "Últimos clientes, fecho de caixa e limpeza final.");
    if (phase === "closed") this.log("phase", "Casa fechada. Luzes baixas e porta trancada.");
  }

  /* --------------------------------------------------------------- arrivals */

  private updateArrivals(_dt: number) {
    const phase = this.phaseInfo;
    if (phase.phase !== "lunch" && phase.phase !== "dinner") return;
    if (this.absMinute < this.nextArrivalAt) return;

    if (phase.lastSeating && this.absMinute >= this.closeAt() - LAST_SEATING_BEFORE_CLOSE) {
      this.nextArrivalAt = this.absMinute + 5;
      return;
    }

    this.nextArrivalAt = this.absMinute + this.arrivalMinutes * (0.8 + this.rng() * 0.6);
    if (this.rng() < 0.12) return; // a quiet minute

    const size = pickPartySize(this.rng);
    const table = this.pickTable(size);
    if (!table) {
      this.log("wait", "Casa cheia: o grupo aguarda alguns minutos ao balcão.");
      return;
    }
    this.seatParty(table, size);
  }

  private closeAt() {
    return this.phaseInfo.phase === "dinner" ? OPENING.dinner.close : OPENING.lunch.close;
  }

  private pickTable(size: number): TableRuntime | null {
    const candidates = this.tables
      .filter((t) => t.status === "free" && t.partyId === null && t.table.seats >= size)
      .sort((a, b) => a.table.seats - b.table.seats);
    if (candidates.length === 0) return null;
    // Prefer the tightest fit, but occasionally spread the room out.
    return this.rng() < 0.7 ? candidates[0] : candidates[Math.floor(this.rng() * candidates.length)];
  }

  private seatParty(table: TableRuntime, size: number) {
    this.partySeq += 1;
    const id = `p${this.partySeq}`;
    const guests: string[] = [];
    const seats = table.seats.slice(0, size);
    seats.forEach((seat, index) => {
      const actorId = `${id}-g${index + 1}`;
      guests.push(actorId);
      const actor: SimActor = {
        id: actorId,
        kind: "guest",
        name: guestName(index, this.rng),
        x: LANDMARKS.door.x + (this.rng() - 0.5) * 0.5,
        z: LANDMARKS.door.z + (this.rng() - 0.5) * 0.5,
        rotation: Math.PI,
        pose: "walk",
        hidden: false,
        seed: Math.floor(this.rng() * 1000),
      stride: 0,
        carrying: "none",
        plate: null,
        glass: 0,
        bathroomIn: null,
        inBathroom: false,
        tableId: table.table.id,
        seatIndex: index,
      };
      this.actors.push(actor);
      const start = this.nav.nearestFree({ x: actor.x, z: actor.z });
      const approach = this.nav.nearestFree({ x: seat.x, z: seat.z });
      const path = this.nav.path(start, approach);
      path.push({ x: seat.x, z: seat.z });
      this.routes.set(actorId, {
        points: path,
        onDone: () => {
          actor.pose = "sit";
          actor.rotation = seat.rotation;
        },
      });
    });

    const party: SimParty = {
      id,
      tableId: table.table.id,
      guests,
      state: "arriving",
      size,
      lines: [],
      totalCents: 0,
      course: null,
      courseStartedAt: 0,
      courseReadyAt: 0,
      stateUntil: this.absMinute + 1.2,
      paymentMode: size <= 2 ? (this.rng() < 0.5 ? "table" : "counter") : this.rng() < 0.7 ? "table" : "counter",
      paymentMethod: pickPaymentMethod(this.rng),
      paidAt: null,
      arrivedAt: this.absMinute,
      seatedAt: null,
      seatCount: size,
      waiterId: null,
      requestedBill: false,
      hasDessert: this.rng() < 0.45,
      note: "",
    };
    this.parties.set(id, party);
    table.status = "reserved";
    table.partyId = id;
    table.reservedFor = id;
    this.stats.arrivals += 1;
    this.stats.guestsInside += size;
    this.log("arrival", `${size} ${size === 1 ? "pessoa" : "pessoas"} à porta — ${table.table.code}.`, table.table.code);

    // The host walks to the door to receive them.
    this.assignHostGreeting();
  }

  private assignHostGreeting() {
    const host = this.staff.find((s) => s.role === "host");
    if (!host) return;
    const actor = host.actor;
    const start = this.nav.nearestFree({ x: actor.x, z: actor.z });
    const door = this.nav.nearestFree({ x: LANDMARKS.door.x - 0.6, z: LANDMARKS.door.z - 0.6 });
    actor.pose = "walk";
    actor.hidden = false;
    this.routes.set(host.id, {
      points: this.nav.path(start, door),
      onDone: () => {
        actor.pose = "stand";
        actor.rotation = Math.PI * 0.9;
      },
    });
  }

  /* ------------------------------------------------------------------ staff */

  private updateStaff(_dt: number) {
    const phase = this.phaseInfo.phase;
    const guestsRemain = [...this.parties.values()].some((p) =>
      ["arriving", "ordering", "waiting", "eating", "dessert", "paying", "leaving"].includes(p.state),
    );
    // The team only stops when the last guest has left — service never freezes
    // mid-dinner just because the clock crossed 15:00 or 23:00.
    const offTheFloor = (phase === "break" || phase === "closed") && !guestsRemain;
    for (const staff of this.staff) {
      if (staff.role === "host" && offTheFloor) staff.actor.hidden = true;
      if (staff.role !== "host") staff.actor.hidden = offTheFloor;
    }
    for (const chef of this.actors.filter((a) => a.kind === "chef")) chef.hidden = offTheFloor;

    const waiters = this.staff.filter((s) => s.role === "waiter" || s.role === "runner");
    for (const waiter of waiters) {
      if (waiter.actor.hidden) continue;
      if (waiter.task) {
        if (this.absMinute >= waiter.task.until && waiter.routeDone) this.completeTask(waiter);
        continue;
      }
      const task = this.nextTask();
      if (task) this.startTask(waiter, task);
    }

    // Host returns to the desk when idle and the door is quiet.
    const host = this.staff.find((s) => s.role === "host");
    if (host && !host.actor.hidden && this.absMinute > host.busyUntil && !this.routes.has(host.id) && host.actor.pose !== "stand") {
      const desk = this.nav.nearestFree(LANDMARKS.host);
      this.routes.set(host.id, {
        points: this.nav.path({ x: host.actor.x, z: host.actor.z }, desk),
        onDone: () => {
          host.actor.pose = "stand";
          host.actor.rotation = Math.PI * 0.85;
        },
      });
    }
  }

  private nextTask(): { kind: TaskKind; party: SimParty; table: TableRuntime } | null {
    const claimed = new Set(this.staff.filter((s) => s.task).map((s) => s.task!.partyId));
    const priority: PartyState[] = ["paying", "dessert", "eating", "waiting", "ordering", "arriving"];
    const ordered = [...this.parties.values()].sort((a, b) => priority.indexOf(a.state) - priority.indexOf(b.state));
    for (const party of ordered) {
      if (claimed.has(party.id)) continue;
      const table = this.tables.find((t) => t.table.id === party.tableId);
      if (!table) continue;
      if (
        (party.state === "arriving" || party.state === "ordering") &&
        party.seatedAt !== null &&
        this.absMinute >= party.stateUntil &&
        this.allSeated(party)
      ) {
        return { kind: "order", party, table };
      }
      if (party.state === "waiting" && party.courseReadyAt > 0 && this.absMinute >= party.courseReadyAt) {
        return { kind: "deliver", party, table };
      }
      if (party.state === "eating" && this.absMinute >= party.stateUntil) {
        return { kind: "clear", party, table };
      }
      if (party.state === "dessert" && this.absMinute >= party.stateUntil) {
        return { kind: "clear", party, table };
      }
      if (party.state === "paying" && party.paymentMode === "table" && !party.requestedBill) {
        return { kind: "terminal", party, table };
      }
    }
    for (const table of this.tables) {
      if (table.status === "cleaning" && this.absMinute >= table.cleaningUntil - 4) {
        const party = table.partyId ? this.parties.get(table.partyId) : null;
        if (party && party.state === "done") return { kind: "clean", party, table };
      }
    }
    return null;
  }

  private startTask(waiter: WaiterRuntime, task: { kind: TaskKind; party: SimParty; table: TableRuntime }) {
    const actor = waiter.actor;
    actor.hidden = false;
    actor.pose = "walk";
    waiter.task = {
      kind: task.kind,
      partyId: task.party.id,
      tableId: task.table.table.id,
      stage: "toTable",
      until: this.absMinute + 1,
    };
    waiter.routeDone = false;
    task.party.waiterId = waiter.id;
    if (task.kind === "terminal") task.party.requestedBill = true;

    const destination = this.servicePoint(task.table);
    const start = this.nav.nearestFree({ x: actor.x, z: actor.z });
    const target = this.nav.nearestFree(destination);
    const path = this.nav.path(start, target);
    if (task.kind !== "clean") path.push(destination);
    this.routes.set(waiter.id, {
      points: path,
      onDone: () => {
        waiter.routeDone = true;
        waiter.task!.until = this.absMinute + taskDuration(task.kind, this.rng);
        actor.pose = poseForTask(task.kind);
      },
    });
    if (task.kind === "deliver" || task.kind === "clear") actor.carrying = "tray";
    if (task.kind === "terminal") actor.carrying = "terminal";
  }

  private completeTask(waiter: WaiterRuntime) {
    const task = waiter.task;
    if (!task) return;
    const party = this.parties.get(task.partyId);
    const table = this.tables.find((t) => t.table.id === task.tableId);
    waiter.task = null;
    waiter.actor.carrying = "none";
    waiter.actor.pose = "stand";
    if (!party || !table) {
      waiter.busyUntil = this.absMinute;
      return;
    }

    if (task.kind === "order") {
      this.takeOrder(party, table);
    } else if (task.kind === "deliver") {
      this.serveCourse(party, table);
    } else if (task.kind === "clear") {
      this.clearCourse(party, table);
    } else if (task.kind === "terminal") {
      this.payAtTable(party, table);
    } else if (task.kind === "clean") {
      // The table may have been cleaned and re-seated while the waiter was
      // walking — never free a table that now belongs to another party.
      if (table.status === "cleaning" && table.partyId === party.id) {
        table.status = "free";
        table.partyId = null;
        table.cleaningUntil = 0;
        this.log("cleaning", `${table.table.code} pronta para o próximo serviço.`, table.table.code);
      }
      waiter.actor.pose = "stand";
    }
    waiter.busyUntil = this.absMinute + 0.4;
  }

  private servicePoint(table: TableRuntime): Point {
    const dims = tableDimensions(table.table);
    const reach = (table.table.shape === "round" ? dims.radius : dims.width / 2) + 0.95;
    const offset = table.table.rotation;
    return {
      x: table.table.x + Math.sin(offset + Math.PI / 2) * reach,
      z: table.table.z + Math.cos(offset + Math.PI / 2) * reach,
    };
  }

  private takeOrder(party: SimParty, table: TableRuntime) {
    party.seatedAt = party.seatedAt ?? this.absMinute;
    const lines = this.buildOrder(party);
    party.lines = lines;
    party.totalCents = lines.reduce((sum, line) => sum + line.priceCents, 0);
    party.state = "waiting";
    party.course = "main";
    const prep = 7 + this.rng() * 9;
    party.courseReadyAt = this.absMinute + prep;
    party.stateUntil = party.courseReadyAt;
    table.status = "seated";
    for (const guestId of party.guests) {
      const guest = this.actor(guestId);
      if (guest) guest.pose = "talk";
    }
    this.stats.orders += 1;
    this.log("order", `${table.table.code} · pedido de ${party.size} pax enviado para a cozinha.`, table.table.code);
  }

  private buildOrder(party: SimParty) {
    const entries = this.products.filter((p) => /entrada/i.test(p.category));
    const mains = this.products.filter((p) => /prato|brasa/i.test(p.category));
    const desserts = this.products.filter((p) => /sobremesa/i.test(p.category));
    const drinks = this.products.filter((p) => /bar/i.test(p.category));
    const pick = (list: SimProduct[]) => (list.length ? list[Math.floor(this.rng() * list.length)] : null);
    const lines: SimParty["lines"] = [];
    for (const guestId of party.guests) {
      const guest = this.actor(guestId);
      const entry = this.rng() < 0.5 ? pick(entries) : null;
      if (entry) lines.push({ productId: entry.id, name: entry.name, priceCents: entry.priceCents, course: "entry" });
      const main = pick(mains) ?? MENU_FALLBACK[0];
      lines.push({ productId: main.id, name: main.name, priceCents: main.priceCents, course: "main" });
      if (party.hasDessert && this.rng() < 0.7) {
        const dessert = pick(desserts);
        if (dessert) lines.push({ productId: dessert.id, name: dessert.name, priceCents: dessert.priceCents, course: "dessert" });
      }
      if (this.rng() < 0.6) {
        const drink = pick(drinks);
        if (drink) lines.push({ productId: drink.id, name: drink.name, priceCents: drink.priceCents, course: "main" });
      }
      if (guest && this.rng() < 0.35) guest.bathroomIn = 4 + this.rng() * 14;
    }
    return lines;
  }

  private serveCourse(party: SimParty, table: TableRuntime) {
    party.state = party.course === "dessert" ? "dessert" : "eating";
    const duration = party.course === "dessert" ? 8 + this.rng() * 6 : 16 + this.rng() * 12;
    party.stateUntil = this.absMinute + duration;
    table.status = "eating";
    for (const guestId of party.guests) {
      const guest = this.actor(guestId);
      if (!guest) continue;
      const sameTable = guest.tableId === table.table.id;
      if (!sameTable) continue;
      guest.plate = { course: party.course ?? "main", fill: 1 };
      guest.glass = Math.max(guest.glass, 0.6);
      guest.pose = "eat";
    }
    this.stats.served += 1;
    this.log("served", `${table.table.code} · ${party.course === "dessert" ? "sobremesas" : "pratos"} na mesa.`, table.table.code);
  }

  private clearCourse(party: SimParty, table: TableRuntime) {
    const wasDessert = party.course === "dessert";
    for (const guestId of party.guests) {
      const guest = this.actor(guestId);
      if (guest) {
        guest.plate = null;
        guest.glass = 0;
        guest.pose = "talk";
      }
    }
    if (wasDessert) {
      this.beginPayment(party, table);
      return;
    }
    if (party.hasDessert) {
      party.course = "dessert";
      party.state = "waiting";
      party.courseReadyAt = this.absMinute + 2.5 + this.rng() * 3;
      party.stateUntil = party.courseReadyAt;
      this.log("cleared", `${table.table.code} · pratos retirados; seguem-se as sobremesas.`, table.table.code);
      return;
    }
    this.log("cleared", `${table.table.code} · pratos retirados.`, table.table.code);
    this.beginPayment(party, table);
  }

  private beginPayment(party: SimParty, table: TableRuntime) {
    party.state = "paying";
    party.stateUntil = this.absMinute + 30;
    table.status = "paying";
    if (party.paymentMode === "counter") {
      for (const guestId of party.guests) {
        const guest = this.actor(guestId);
        if (!guest) continue;
        guest.pose = "walk";
        const start = this.nav.nearestFree({ x: guest.x, z: guest.z });
        const counter = this.nav.nearestFree(LANDMARKS.counter);
        const path = this.nav.path(start, counter);
        path.push(LANDMARKS.counter);
        this.routes.set(guestId, {
          points: path,
          onDone: () => {
            guest.pose = "pay";
          },
        });
      }
      party.stateUntil = this.absMinute + 8;
      this.log(
        "payment",
        `${table.table.code} · conta de ${formatEuros(party.totalCents)} pedida; clientes dirigem-se ao balcão.`,
        table.table.code,
      );
    }
  }

  private payAtTable(party: SimParty, table: TableRuntime) {
    this.markPaid(party, table, "mesa");
  }

  private markPaid(party: SimParty, table: TableRuntime, where: "mesa" | "balcão") {
    party.paidAt = this.absMinute;
    this.stats.paid += 1;
    this.stats.revenueCents += party.totalCents;
    this.ticketSum += party.totalCents;
    this.ticketsPaid += 1;
    this.stats.averageTicketCents = Math.round(this.ticketSum / this.ticketsPaid);
    this.log(
      "payment",
      `${table.table.code} · ${formatEuros(party.totalCents)} pagos ${party.paymentMode === "counter" ? "no balcão" : "na mesa"} (${
        methodLabel(party.paymentMethod)
      }, ${where}).`,
      table.table.code,
    );
    party.state = "leaving";
    party.stateUntil = this.absMinute + 1;
    table.status = "cleaning";
    table.cleaningUntil = this.absMinute + 4;
    // Guests are either at the table or at the counter; walk them out from wherever they are.
    this.walkPartyOut(party);
  }

  private walkPartyOut(party: SimParty) {
    for (const guestId of party.guests) {
      const guest = this.actor(guestId);
      if (!guest) continue;
      guest.pose = "walk";
      const start = this.nav.nearestFree({ x: guest.x, z: guest.z });
      const door = this.nav.nearestFree({ x: LANDMARKS.door.x, z: LANDMARKS.door.z });
      const path = this.nav.path(start, door);
      path.push({ x: LANDMARKS.door.x + 0.4, z: LANDMARKS.door.z + 0.9 });
      this.routes.set(guestId, {
        points: path,
        onDone: () => {
          guest.hidden = true;
        },
      });
    }
    const table = this.tables.find((t) => t.table.id === party.tableId);
    if (table) {
      this.log("left", `${table.table.code} · clientes a sair. Mesa a limpar.`, table.table.code);
    }
    this.finishPartyOnce(party);
  }

  private finishParty(party: SimParty) {
    party.state = "done";
    for (const guestId of party.guests) {
      const guest = this.actor(guestId);
      if (guest) {
        guest.plate = null;
        guest.glass = 0;
        guest.bathroomIn = null;
      }
    }
    this.stats.guestsInside = Math.max(0, this.stats.guestsInside - party.size);
  }

  private updateParties(_dt: number) {
    for (const party of this.parties.values()) {
      const table = this.tables.find((t) => t.table.id === party.tableId);
      if (!table) continue;
      if (party.state === "arriving") {
        if (this.absMinute >= party.stateUntil && this.allSeated(party) && party.seatedAt === null) {
          party.seatedAt = this.absMinute;
          party.stateUntil = this.absMinute + 6;
          table.status = "seated";
          for (const guestId of party.guests) {
            const guest = this.actor(guestId);
            if (guest) guest.pose = "read";
          }
          this.log("seated", `${table.table.code} · ${party.size} pax sentados; a equipa vai à mesa.`, table.table.code);
        }
      } else if (party.state === "paying" && party.paymentMode === "counter" && this.absMinute >= party.stateUntil) {
        this.markPaid(party, table, "balcão");
      } else if (party.state === "leaving" && this.absMinute >= party.stateUntil + 1.4) {
        // The party may still be walking; once they reach the door the route hides them.
        this.finishPartyOnce(party);
      }
    }
  }

  private finishPartyOnce(party: SimParty) {
    if (party.state !== "leaving") return;
    const allHidden = party.guests.every((id) => this.actor(id)?.hidden);
    if (allHidden) this.finishParty(party);
  }

  private allSeated(party: SimParty) {
    return party.guests.every((id) => {
      const guest = this.actor(id);
      return guest ? guest.pose === "sit" || guest.pose === "read" || guest.pose === "talk" : true;
    });
  }

  private updateBathrooms(dt: number) {
    for (const actor of this.actors) {
      if (actor.kind !== "guest" || actor.hidden) continue;
      if (actor.inBathroom) continue;
      if (actor.seatIndex === undefined) continue;
      if (actor.bathroomIn === null) continue;
      if (actor.bathroomIn > 0) {
        actor.bathroomIn -= dt;
        continue;
      }
      actor.bathroomIn = null;
      actor.pose = "walk";
      this.stats.bathrooms += 1;
      const start = this.nav.nearestFree({ x: actor.x, z: actor.z });
      const bathroom = this.nav.nearestFree(LANDMARKS.bathroom);
      const path = this.nav.path(start, bathroom);
      this.routes.set(actor.id, {
        points: path,
        onDone: () => {
          actor.hidden = true;
          actor.inBathroom = true;
          const table = this.tables.find((t) => t.table.id === actor.tableId);
          this.log("bathroom", `${table?.table.code ?? "Sala"} · um cliente foi à casa de banho.`, table?.table.code);
          this.scheduleBathroomReturn(actor);
        },
      });
    }
  }

  private bathroomReturns: Array<{ actor: SimActor; at: number }> = [];

  private scheduleBathroomReturn(actor: SimActor) {
    this.bathroomReturns.push({ actor, at: this.absMinute + 1.5 + this.rng() * 1.8 });
  }

  private processBathroomReturns() {
    const due = this.bathroomReturns.filter((r) => r.at <= this.absMinute);
    if (due.length === 0) return;
    this.bathroomReturns = this.bathroomReturns.filter((r) => r.at > this.absMinute);
    for (const { actor } of due) {
      if (!actor.inBathroom) continue;
      const seat = this.seatFor(actor);
      actor.hidden = false;
      actor.inBathroom = false;
      actor.pose = "walk";
      const start = this.nav.nearestFree({ x: actor.x, z: actor.z });
      const approach = this.nav.nearestFree({ x: seat.x, z: seat.z });
      const path = this.nav.path(start, approach);
      path.push(seat);
      this.routes.set(actor.id, {
        points: path,
        onDone: () => {
          actor.pose = "sit";
        },
      });
    }
  }

  /* ---------------------------------------------------------------- helpers */

  private seatFor(actor: SimActor) {
    const table = this.tables.find((t) => t.table.id === actor.tableId);
    if (!table || actor.seatIndex === undefined) return { x: actor.x, z: actor.z, rotation: actor.rotation };
    return table.seats[actor.seatIndex] ?? table.seats[0];
  }

  private moveActors(dt: number) {
    this.processBathroomReturns();
    for (const actor of this.actors) {
      const route = this.routes.get(actor.id);
      if (!route) continue;
      if (route.points.length === 0) {
        this.routes.delete(actor.id);
        route.onDone?.();
        continue;
      }
      let budget = WALK_M_PER_MIN * dt;
      while (budget > 0 && route.points.length > 0) {
        const next = route.points[0];
        const dx = next.x - actor.x;
        const dz = next.z - actor.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= budget) {
          actor.x = next.x;
          actor.z = next.z;
          budget -= distance;
          route.points.shift();
          actor.stride = (actor.stride + distance * 1.6) % 1;
        } else {
          const k = budget / distance;
          actor.x += dx * k;
          actor.z += dz * k;
          actor.rotation = angleLerp(actor.rotation, Math.atan2(dx, dz), 0.35);
          actor.stride = (actor.stride + budget * 1.6) % 1;
          budget = 0;
        }
        if (route.points.length === 0) {
          this.routes.delete(actor.id);
          route.onDone?.();
        }
      }
    }
  }

  private updateTables() {
    for (const table of this.tables) {
      if (table.status === "cleaning" && table.cleaningUntil === 0) {
        table.cleaningUntil = this.absMinute + 3.5;
      }
    }
    this.stats.tablesOccupied = this.tables.filter((t) => t.status !== "free").length;
    this.stats.partiesSeated = [...this.parties.values()].filter((p) =>
      ["ordering", "waiting", "eating", "dessert", "paying"].includes(p.state),
    ).length;
    this.stats.partiesWaiting = this.waitingParties.length;
  }

  private routesHasAny(party: SimParty) {
    return party.guests.some((id) => this.routes.has(id));
  }

  private updateTableCleaning() {
    for (const table of this.tables) {
      if (table.status !== "cleaning" || table.cleaningUntil === 0 || this.absMinute < table.cleaningUntil) continue;
      // Never release a table while its party is still in the room: guests may
      // be settling the bill or walking out, and a second seating here is a bug.
      const party = table.partyId ? this.parties.get(table.partyId) : null;
      if (party && party.state !== "done") continue;
      table.status = "free";
      table.partyId = null;
      table.cleaningUntil = 0;
    }
  }

  private actor(id: string) {
    return this.actors.find((a) => a.id === id);
  }

  private addActor(actor: SimActor) {
    this.actors.push(actor);
  }

  private log(kind: SimEvent["kind"], text: string, tableCode?: string) {
    this.events.unshift({
      id: this.eventId++,
      at: this.absMinute,
      kind,
      text: `${formatMinutes(((this.minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY)} · ${text}`,
      tableCode,
    });
    if (this.events.length > 140) this.events.pop();
  }

  snapshot(): SimSnapshot {
    return {
      clock: this.clock,
      phase: this.phaseInfo,
      stats: { ...this.stats, tablesOccupied: this.tables.filter((t) => t.status !== "free").length },
      events: this.events.slice(0, 40),
      parties: [...this.parties.values()]
        .filter((p) => p.state !== "done")
        .map((p) => ({
          id: p.id,
          tableId: p.tableId,
          tableCode: this.tables.find((t) => t.table.id === p.tableId)?.table.code ?? "—",
          size: p.size,
          state: p.state,
          totalCents: p.totalCents,
          paymentMode: p.paymentMode,
          paymentMethod: p.paymentMethod,
          course: p.course,
        })),
      tables: this.tables.map((t) => ({
        id: t.table.id,
        code: t.table.code,
        status: t.status,
        partyId: t.partyId,
        zoneName: t.table.zoneName,
      })),
      staff: this.staff.map((s) => ({ id: s.id, name: s.name, role: s.role, shift: s.shift, task: s.task?.kind ?? null })),
      dayLight: this.dayLight,
      speed: this.speed,
      paused: this.paused,
    };
  }
}

/* -------------------------------------------------------------- utilities */

function emptyStats(): SimStats {
  return {
    guestsInside: 0,
    partiesSeated: 0,
    partiesWaiting: 0,
    arrivals: 0,
    orders: 0,
    served: 0,
    paid: 0,
    revenueCents: 0,
    averageTicketCents: 0,
    bathrooms: 0,
    tablesOccupied: 0,
    tablesTotal: 20,
  };
}

const GUEST_NAMES = [
  "Ana", "Bruno", "Carla", "Duarte", "Elena", "Filipe", "Gabriela", "Hugo", "Inês", "João",
  "Karla", "Luís", "Marta", "Nuno", "Olga", "Pedro", "Rita", "Sérgio", "Teresa", "Vasco",
];

function guestName(index: number, random: () => number) {
  return GUEST_NAMES[(index + Math.floor(random() * GUEST_NAMES.length)) % GUEST_NAMES.length];
}

function pickPartySize(random: () => number) {
  const r = random();
  if (r < 0.34) return 2;
  if (r < 0.55) return 1;
  if (r < 0.82) return 3;
  return 4;
}

function pickPaymentMethod(random: () => number): PaymentMethod {
  const r = random();
  if (r < 0.62) return "card";
  if (r < 0.86) return "mbway";
  return "cash";
}

function methodLabel(method: PaymentMethod) {
  return method === "card" ? "cartão" : method === "mbway" ? "MB WAY" : "dinheiro";
}

function taskDuration(kind: TaskKind, random: () => number) {
  if (kind === "order") return 1.1 + random() * 0.9;
  if (kind === "deliver") return 0.5 + random() * 0.4;
  if (kind === "clear") return 0.6 + random() * 0.5;
  if (kind === "terminal") return 1.2 + random() * 1.2;
  if (kind === "clean") return 2.2 + random() * 1.6;
  return 0.8;
}

function poseForTask(kind: TaskKind) {
  if (kind === "deliver") return "serve" as const;
  if (kind === "clear") return "clear" as const;
  if (kind === "terminal") return "pay" as const;
  if (kind === "order") return "wait" as const;
  if (kind === "clean") return "clear" as const;
  return "stand" as const;
}

function formatMinutes(minutes: number) {
  const total = Math.round(minutes) % MINUTES_PER_DAY;
  const h = Math.floor(total / 60);
  const m = Math.floor(total % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatEuros(cents: number) {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function weekdayLabel(weekday: number) {
  return WEEKDAYS[weekday] ?? "";
}

export function weekdayShort(weekday: number) {
  return WEEKDAYS_SHORT[weekday] ?? "";
}

export function formatClock(minutes: number) {
  return formatMinutes(minutes);
}

export function nextOpening(weekday: number, minutes: number) {
  if (weekday !== 1 && weekday !== 2 && minutes < OPENING.lunch.start) return { weekday, minutes: OPENING.lunch.start };
  if (weekday !== 1 && weekday !== 2 && minutes < OPENING.dinner.start && minutes >= OPENING.lunch.close) {
    return { weekday, minutes: OPENING.dinner.start };
  }
  let nextDay = (weekday + 1) % 7;
  while (nextDay === 1 || nextDay === 2) nextDay = (nextDay + 1) % 7;
  return { weekday: nextDay, minutes: OPENING.lunch.start };
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

function angleLerp(current: number, target: number, factor: number) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * factor;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
