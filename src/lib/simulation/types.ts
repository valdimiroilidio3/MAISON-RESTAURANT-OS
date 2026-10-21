/**
 * Types for the live restaurant simulation. Pure data only — the engine must be
 * runnable in Node (tests) and in the browser without touching the database.
 */

export type Phase = "closed" | "prep" | "lunch" | "break" | "dinner" | "closing";

export type ActorKind = "guest" | "host" | "waiter" | "runner" | "chef" | "manager";

export type Pose =
  | "stand"
  | "walk"
  | "sit"
  | "read"
  | "talk"
  | "eat"
  | "drink"
  | "pay"
  | "carry"
  | "serve"
  | "clear"
  | "cook"
  | "wait";

export type Course = "entry" | "main" | "dessert";

export type PaymentMode = "table" | "counter";

export type PaymentMethod = "card" | "cash" | "mbway";

export type PartyState =
  | "arriving"
  | "seating"
  | "ordering"
  | "waiting"
  | "eating"
  | "clearing"
  | "dessert"
  | "paying"
  | "leaving"
  | "done";

export interface SimTable {
  id: number;
  code: string;
  seats: number;
  shape: "round" | "rect";
  x: number;
  z: number;
  rotation: number;
  zoneSlug: string;
  zoneName: string;
}

export interface SimProduct {
  id: number;
  name: string;
  priceCents: number;
  category: string;
}

export interface SimActor {
  id: string;
  kind: ActorKind;
  name: string;
  x: number;
  z: number;
  rotation: number;
  pose: Pose;
  hidden: boolean;
  seed: number;
  /** 0..1 walk cycle phase, advanced while moving. */
  stride: number;
  seatIndex?: number;
  tableId?: number;
  /** Visual props carried by this actor. */
  carrying: "tray" | "terminal" | "none";
  /** Guest plate: null when there is nothing in front of them. */
  plate: { course: Course; fill: number } | null;
  /** Glass on the table, 0..1. */
  glass: number;
  /** Guests only: seconds until they consider a bathroom trip. */
  bathroomIn: number | null;
  inBathroom: boolean;
}

export interface SimGuestLine {
  productId: number;
  name: string;
  priceCents: number;
  course: Course;
}

export interface SimParty {
  id: string;
  tableId: number;
  guests: string[];
  state: PartyState;
  size: number;
  lines: SimGuestLine[];
  totalCents: number;
  course: Course | null;
  courseStartedAt: number;
  courseReadyAt: number;
  stateUntil: number;
  paymentMode: PaymentMode;
  paymentMethod: PaymentMethod;
  paidAt: number | null;
  arrivedAt: number;
  seatedAt: number | null;
  seatCount: number;
  waiterId: string | null;
  requestedBill: boolean;
  hasDessert: boolean;
  note: string;
}

export interface SimEvent {
  id: number;
  at: number;
  kind:
    | "arrival"
    | "seated"
    | "order"
    | "kitchen"
    | "served"
    | "cleared"
    | "bathroom"
    | "payment"
    | "left"
    | "cleaning"
    | "phase"
    | "staff"
    | "wait";
  text: string;
  tableCode?: string;
}

export interface SimStaff {
  id: string;
  name: string;
  role: "host" | "waiter" | "runner" | "chef" | "manager";
  actorId: string;
  task: SimTask | null;
  shift: "on" | "break" | "off";
}

export type TaskKind = "order" | "deliver" | "clear" | "terminal" | "clean" | "seat";

export interface SimTask {
  kind: TaskKind;
  partyId: string;
  tableId: number;
  /** Where the staff member is heading within the task. */
  stage: "toTable" | "serving" | "toPass" | "toCounter";
  until: number;
}

export interface SimClock {
  /** Minutes since local midnight (float). */
  minutes: number;
  /** 0 = Sunday … 6 = Saturday, in Europe/Lisbon. */
  weekday: number;
  /** ISO date in the restaurant timezone, e.g. 2026-10-21. */
  date: string;
}

export interface SimStats {
  guestsInside: number;
  partiesSeated: number;
  partiesWaiting: number;
  arrivals: number;
  orders: number;
  served: number;
  paid: number;
  revenueCents: number;
  averageTicketCents: number;
  bathrooms: number;
  tablesOccupied: number;
  tablesTotal: number;
}
