/**
 * Shared, framework-agnostic domain types.
 * These types are imported by both server and client code, so this module must
 * never import `server-only`, the database, or Node built-ins.
 */

export type Role = "manager" | "waiter" | "chef";

export const ROLE_LABELS: Record<Role, string> = {
  manager: "Gestão",
  waiter: "Sala",
  chef: "Cozinha",
};

export type TableStatus =
  | "available"
  | "reserved"
  | "occupied"
  | "order_pending"
  | "awaiting_payment"
  | "cleaning";

export type OrderStatus =
  | "open"
  | "sent"
  | "partially_ready"
  | "ready"
  | "served"
  | "awaiting_payment"
  | "paid"
  | "cancelled";

export type OrderItemStatus = "draft" | "sent" | "preparing" | "ready" | "served" | "void";

export type PaymentStatus = "unpaid" | "pending" | "recorded" | "confirmed" | "refunded";
export type PaymentMethod = "cash" | "card" | "mbway" | "voucher" | "transfer";

export type ReservationStatus = "pending" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";

export interface RestaurantConfig {
  id: number;
  name: string;
  slug: string;
  tagline: string;
  currency: string;
  taxRateBps: number;
  pricesIncludeTax: boolean;
  serviceChargeBps: number;
  timezone: string;
  address: string;
  phone: string;
  email: string;
  lunchHours: string;
  dinnerHours: string;
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  restaurantId: number;
  restaurantName: string;
}

export interface Zone {
  id: number;
  name: string;
  slug: string;
}

export interface TableSummary {
  id: number;
  code: string;
  seats: number;
  shape: "round" | "rect";
  x: number;
  z: number;
  rotation: number;
  status: TableStatus;
  zoneId: number;
  zoneName: string;
  order: {
    id: number;
    number: number;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    guests: number;
    totalCents: number;
    openedAt: string;
    waiterName: string;
    itemCount: number;
    readyCount: number;
  } | null;
  reservation: {
    id: number;
    time: string;
    partySize: number;
    customerName: string;
    status: ReservationStatus;
  } | null;
}

export interface FloorSnapshot {
  tables: TableSummary[];
  zones: Zone[];
  serverTime: string;
  stats: {
    available: number;
    reserved: number;
    occupied: number;
    orderPending: number;
    awaitingPayment: number;
    cleaning: number;
    guests: number;
    openRevenueCents: number;
  };
}

export interface OrderModifier {
  id: number;
  name: string;
  priceDeltaCents: number;
}

export interface OrderItem {
  id: number;
  productId: number | null;
  name: string;
  unitPriceCents: number;
  qty: number;
  notes: string;
  status: OrderItemStatus;
  modifiers: OrderModifier[];
  course: string;
  createdAt: string;
  sentAt: string | null;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  lineTotalCents: number;
}

export interface OrderEvent {
  id: number;
  type: string;
  detail: string;
  actorName: string | null;
  createdAt: string;
}

export interface Payment {
  id: number;
  amountCents: number;
  method: PaymentMethod;
  status: "recorded" | "confirmed" | "refunded";
  reference: string | null;
  createdAt: string;
  confirmedAt: string | null;
  confirmedByName: string | null;
  actorName: string | null;
}

export interface OrderDetail {
  id: number;
  number: number;
  tableId: number;
  tableCode: string;
  zoneName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  guests: number;
  waiterName: string;
  notes: string;
  items: OrderItem[];
  payments: Payment[];
  events: OrderEvent[];
  totals: {
    subtotalCents: number;
    discountCents: number;
    taxCents: number;
    netSalesCents: number;
    serviceCents: number;
    totalCents: number;
    paidCents: number;
    balanceCents: number;
  };
  openedAt: string;
  closedAt: string | null;
  restaurant: {
    taxRateBps: number;
    pricesIncludeTax: boolean;
    serviceChargeBps: number;
    currency: string;
  };
}

export interface MenuCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
}

export interface MenuProduct {
  id: number;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  name: string;
  description: string;
  priceCents: number;
  available: boolean;
  allergens: string[];
  prepMinutes: number;
  course: string;
  imageUrl: string | null;
  featured: boolean;
  sortOrder: number;
  recipe: { ingredientId: number; name: string; unit: string; qty: number }[];
}

export interface MenuCatalog {
  categories: MenuCategory[];
  products: MenuProduct[];
  modifiers: { id: number; name: string; priceDeltaCents: number; groupName: string }[];
}

export interface Ingredient {
  id: number;
  name: string;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  unitCostCents: number;
  supplier: string;
  low: boolean;
}

export interface InventoryMovement {
  id: number;
  ingredientName: string;
  delta: number;
  unit: string;
  reason: string;
  actorName: string | null;
  createdAt: string;
  orderNumber: number | null;
}

export interface KitchenItem {
  id: number;
  orderId: number;
  orderNumber: number;
  tableCode: string;
  name: string;
  qty: number;
  notes: string;
  modifiers: OrderModifier[];
  course: string;
  status: OrderItemStatus;
  sentAt: string | null;
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  waitMinutes: number;
  late: boolean;
  priority: number;
  prepMinutes: number;
}

export interface KitchenTicket {
  orderId: number;
  orderNumber: number;
  tableCode: string;
  guests: number;
  waiterName: string;
  openedAt: string;
  status: OrderStatus;
  items: KitchenItem[];
  oldestMinutes: number;
  late: boolean;
  priority: number;
}

export interface Reservation {
  id: number;
  code: string;
  date: string;
  time: string;
  partySize: number;
  status: ReservationStatus;
  customerId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  tableId: number | null;
  tableCode: string | null;
  note: string;
  source: "website" | "phone" | "walk-in" | "admin";
  createdAt: string;
  updatedAt: string;
}

export interface ReportsSummary {
  range: { from: string; to: string };
  ordersClosed: number;
  guestsServed: number;
  grossSalesCents: number;
  netSalesCents: number;
  taxCents: number;
  serviceCents: number;
  discountCents: number;
  averageTicketCents: number;
  confirmedCents: number;
  recordedCents: number;
  pendingCents: number;
  cancelledOrders: number;
  averageServiceMinutes: number;
  occupancyPercent: number;
  itemsSold: number;
  byDay: { date: string; grossCents: number; orders: number; guests: number }[];
  byProduct: { name: string; category: string; qty: number; grossCents: number }[];
  byCategory: { name: string; qty: number; grossCents: number }[];
  byMethod: { method: PaymentMethod; confirmedCents: number; recordedCents: number; count: number }[];
  openOrders: { count: number; balanceCents: number };
  averagePrepMinutes: number;
}
