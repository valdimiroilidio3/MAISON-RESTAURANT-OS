import type { OrderDetail, TableSummary } from "./types";

/** Shapes returned by the authenticated JSON API and consumed by client components. */
export interface TableDetailPayload {
  table: TableSummary;
  order: OrderDetail | null;
  upcomingReservations: {
    id: number;
    date: string;
    time: string;
    partySize: number;
    status: string;
    customerName: string;
    note: string;
  }[];
}

export interface PublicFloorTable {
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

export interface PublicFloor {
  tables: PublicFloorTable[];
  zones: { id: number; name: string; slug: string }[];
  restaurant: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    lunchHours: string;
    dinnerHours: string;
  };
  capacity: number;
}
