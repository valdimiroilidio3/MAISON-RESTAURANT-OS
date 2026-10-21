import { beforeAll, describe, expect, it } from "vitest";
import { getDb, get, all } from "@/lib/db";
import {
  addOrderItem,
  addPayment,
  cancelOrder,
  closeOrder,
  confirmPayment,
  getFloorSnapshot,
  getOrderDetail,
  listKitchenTickets,
  openOrder,
  releaseTable,
  sendOrder,
  setItemStatus,
  voidOrderItem,
} from "@/lib/orders";
import { getMenuCatalog } from "@/lib/menu";
import { listIngredients } from "@/lib/inventory";
import { availabilityForDate, createReservation } from "@/lib/reservations";
import { getReports } from "@/lib/reports";
import { localDate } from "@/lib/dates";
import { ApiError } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

const restaurantId = 1;
const manager: SessionUser = {
  id: 1,
  name: "Ana Ferreira",
  email: "manager@maison.pt",
  role: "manager",
  restaurantId,
  restaurantName: "MAISON®",
};
const waiter: SessionUser = { id: 2, name: "Diogo Marques", email: "waiter@maison.pt", role: "waiter", restaurantId, restaurantName: "MAISON®" };
const chef: SessionUser = { id: 3, name: "Sofia Lopes", email: "chef@maison.pt", role: "chef", restaurantId, restaurantName: "MAISON®" };

function expectApiError(fn: () => unknown, messagePart?: string | RegExp) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    if (messagePart) expect((error as ApiError).message).toMatch(messagePart);
    return error as ApiError;
  }
  throw new Error("Expected an ApiError to be thrown");
}

beforeAll(() => {
  getDb();
});

describe("seed data", () => {
  it("creates a complete restaurant dataset", () => {
    expect(Number(get<{ c: number }>("SELECT COUNT(*) AS c FROM tables")?.c)).toBe(20);
    expect(Number(get<{ c: number }>("SELECT COUNT(*) AS c FROM products")?.c)).toBe(21);
    expect(Number(get<{ c: number }>("SELECT COUNT(*) AS c FROM reservations")?.c)).toBe(12);
    expect(Number(get<{ c: number }>("SELECT COUNT(*) AS c FROM orders WHERE status='paid'")?.c)).toBeGreaterThanOrEqual(11);
    expect(Number(get<{ c: number }>("SELECT COUNT(*) AS c FROM users")?.c)).toBe(5);
  });

  it("links every open order to a table and a waiter", () => {
    const rows = all<{ c: number }>(
      `SELECT COUNT(*) AS c FROM orders o WHERE o.status NOT IN ('paid','cancelled')
       AND (o.table_id IS NULL OR o.waiter_id IS NULL)`,
    );
    expect(Number(rows[0].c)).toBe(0);
  });
});

describe("floor snapshot", () => {
  it("returns 20 tables with coherent status counts and live orders", () => {
    const snapshot = getFloorSnapshot(restaurantId);
    expect(snapshot.tables).toHaveLength(20);
    const total =
      snapshot.stats.available +
      snapshot.stats.reserved +
      snapshot.stats.occupied +
      snapshot.stats.orderPending +
      snapshot.stats.awaitingPayment +
      snapshot.stats.cleaning;
    expect(total).toBe(20);
    expect(snapshot.stats.cleaning).toBe(1);

    const t07 = snapshot.tables.find((t) => t.code === "T07")!;
    expect(t07.status).toBe("order_pending");
    expect(t07.order?.number).toBe(1042);
    expect(t07.order?.guests).toBe(4);

    const t08 = snapshot.tables.find((t) => t.code === "T08")!;
    expect(t08.status).toBe("awaiting_payment");
    expect(t08.order?.paymentStatus).toBe("recorded");
    expect(t08.order?.totalCents).toBeGreaterThan(0);

    const reserved = snapshot.tables.filter((t) => t.status === "reserved").map((t) => t.code);
    expect(reserved).toEqual(expect.arrayContaining(["T05", "T09", "T12"]));
  });

  it("exposes table detail with upcoming reservations", () => {
    const snapshot = getFloorSnapshot(restaurantId);
    const t05 = snapshot.tables.find((t) => t.code === "T05")!;
    expect(t05.reservation?.time).toBe("20:00");
  });
});

describe("kitchen pipeline", () => {
  it("shows sent orders with preparation targets and a live timer", () => {
    const kitchen = listKitchenTickets(restaurantId);
    const ticket = kitchen.tickets.find((t) => t.orderNumber === 1042);
    expect(ticket).toBeDefined();
    expect(ticket!.items.length).toBeGreaterThan(0);
    expect(ticket!.items.every((i) => ["sent", "preparing", "ready"].includes(i.status))).toBe(true);
    const robalo = ticket!.items.find((i) => i.name === "Robalo selvagem")!;
    expect(robalo.notes).toBe("Sem molho de manteiga");
    expect(robalo.waitMinutes).toBeGreaterThanOrEqual(30);
    expect(robalo.late).toBe(true);
    expect(robalo.prepMinutes).toBe(22);
  });

  it("enforces kitchen transitions and role permissions", () => {
    const kitchen = listKitchenTickets(restaurantId);
    const picanha = kitchen.tickets.find((t) => t.orderNumber === 1042)!.items.find((i) => i.name.startsWith("Picanha"))!;
    expectApiError(() => setItemStatus({ restaurantId, actor: chef, itemId: picanha.id, to: "served" }), /permiss/i);
    setItemStatus({ restaurantId, actor: chef, itemId: picanha.id, to: "ready" });
    const after = listKitchenTickets(restaurantId).tickets.find((t) => t.orderNumber === 1042)!;
    expect(after.items.find((i) => i.id === picanha.id)!.status).toBe("ready");
    setItemStatus({ restaurantId, actor: waiter, itemId: picanha.id, to: "served" });
    expect(getOrderDetail(restaurantId, after.orderId).items.find((i) => i.id === picanha.id)!.status).toBe("served");
  });
});

describe("order lifecycle", () => {
  const created: { orderId?: number; itemId?: number } = {};

  it("opens a new order only on a free table", () => {
    const snapshot = getFloorSnapshot(restaurantId);
    const t07 = snapshot.tables.find((t) => t.code === "T07")!;
    expectApiError(() => openOrder({ restaurantId, actor: waiter, tableId: t07.id, guests: 2 }), /já tem a comanda/);

    const t01 = snapshot.tables.find((t) => t.code === "T01")!;
    const order = openOrder({ restaurantId, actor: waiter, tableId: t01.id, guests: 2 });
    created.orderId = order.orderId;
    expect(order.number).toBeGreaterThan(1045);
    expect(getFloorSnapshot(restaurantId).tables.find((t) => t.code === "T01")!.status).toBe("occupied");
  });

  it("adds items from the single menu source and recalculates VAT", () => {
    const catalog = getMenuCatalog(restaurantId);
    const wine = catalog.products.find((p) => p.name === "Vinho tinto Douro")!;
    const result = addOrderItem({ restaurantId, actor: waiter, orderId: created.orderId!, productId: wine.id, qty: 2 });
    created.itemId = result.itemId;
    const order = getOrderDetail(restaurantId, created.orderId!);
    expect(order.totals.subtotalCents).toBe(1_700);
    expect(order.totals.netSalesCents).toBe(1_382);
    expect(order.totals.taxCents).toBe(318);
    expect(order.totals.totalCents).toBe(1_700);
    expect(order.items[0].status).toBe("draft");
  });

  it("sends to the kitchen, deducts stock and is idempotent", () => {
    const before = listIngredients(restaurantId).find((i) => i.name === "Vinho tinto Douro")!;
    const result = sendOrder({ restaurantId, actor: waiter, orderId: created.orderId! });
    expect(result.sentCount).toBe(1);
    expectApiError(() => sendOrder({ restaurantId, actor: waiter, orderId: created.orderId! }), /Não há artigos novos/);

    const after = listIngredients(restaurantId).find((i) => i.name === "Vinho tinto Douro")!;
    expect(after.stockQty).toBeCloseTo(before.stockQty - 0.3, 5);

    const kitchen = listKitchenTickets(restaurantId);
    const ticket = kitchen.tickets.find((t) => t.orderId === created.orderId);
    expect(ticket).toBeDefined();
    expect(ticket!.tableCode).toBe("T01");
    expect(getFloorSnapshot(restaurantId).tables.find((t) => t.code === "T01")!.status).toBe("order_pending");
  });

  it("records payments but refuses to close until confirmed", () => {
    const order = getOrderDetail(restaurantId, created.orderId!);
    expectApiError(
      () => addPayment({ restaurantId, actor: waiter, orderId: created.orderId!, amountCents: 2_000, method: "cash", idempotencyKey: "idem-over-1" }),
      /excede o saldo/,
    );

    const first = addPayment({
      restaurantId,
      actor: waiter,
      orderId: created.orderId!,
      amountCents: 1_000,
      method: "cash",
      idempotencyKey: "test-pay-1",
    });
    const duplicate = addPayment({
      restaurantId,
      actor: waiter,
      orderId: created.orderId!,
      amountCents: 1_000,
      method: "cash",
      idempotencyKey: "test-pay-1",
    });
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(Number(get<{ c: number }>("SELECT COUNT(*) AS c FROM payments WHERE idempotency_key='test-pay-1'")?.c)).toBe(1);

    addPayment({
      restaurantId,
      actor: waiter,
      orderId: created.orderId!,
      amountCents: 700,
      method: "card",
      idempotencyKey: "test-pay-2",
    });
    const partial = getOrderDetail(restaurantId, created.orderId!);
    expect(partial.totals.paidCents).toBe(1_700);
    expect(partial.paymentStatus).toBe("recorded");

    // Item still in kitchen: cannot close.
    expectApiError(() => closeOrder({ restaurantId, actor: waiter, orderId: created.orderId! }), /por servir/);
    setItemStatus({ restaurantId, actor: chef, itemId: created.itemId!, to: "preparing" });
    setItemStatus({ restaurantId, actor: chef, itemId: created.itemId!, to: "ready" });
    expectApiError(
      () => setItemStatus({ restaurantId, actor: chef, itemId: created.itemId!, to: "served" }),
      /permiss/i,
    );
    setItemStatus({ restaurantId, actor: waiter, itemId: created.itemId!, to: "served" });
    // Payments recorded but not confirmed: cannot close.
    expectApiError(() => closeOrder({ restaurantId, actor: waiter, orderId: created.orderId! }), /por confirmar/);
    expectApiError(() => confirmPayment({ restaurantId, actor: waiter, paymentId: first.paymentId }), /gestão|permiss/i);

    for (const payment of getOrderDetail(restaurantId, created.orderId!).payments) {
      confirmPayment({ restaurantId, actor: manager, paymentId: payment.id });
    }
    const confirmed = getOrderDetail(restaurantId, created.orderId!);
    expect(confirmed.paymentStatus).toBe("confirmed");
    expect(confirmed.totals.balanceCents).toBe(0);

    closeOrder({ restaurantId, actor: waiter, orderId: created.orderId! });
    const closed = getOrderDetail(restaurantId, created.orderId!);
    expect(closed.status).toBe("paid");
    expect(closed.closedAt).not.toBeNull();
    expect(getFloorSnapshot(restaurantId).tables.find((t) => t.code === "T01")!.status).toBe("cleaning");

    releaseTable({ restaurantId, actor: waiter, tableId: closed.tableId });
    expect(getFloorSnapshot(restaurantId).tables.find((t) => t.code === "T01")!.status).toBe("available");

    expectApiError(
      () => addOrderItem({ restaurantId, actor: waiter, orderId: created.orderId!, productId: 1, qty: 1 }),
      /fechada/i,
    );
  });

  it("voids a sent item only with management approval and reverses stock", () => {
    const snapshot = getFloorSnapshot(restaurantId);
    const t04 = snapshot.tables.find((t) => t.code === "T04")!;
    const order = openOrder({ restaurantId, actor: waiter, tableId: t04.id, guests: 2 });
    const catalog = getMenuCatalog(restaurantId);
    const picanha = catalog.products.find((p) => p.name.startsWith("Picanha"))!;
    const added = addOrderItem({ restaurantId, actor: waiter, orderId: order.orderId, productId: picanha.id, qty: 1, notes: "Teste" });
    const beforeStock = listIngredients(restaurantId).find((i) => i.name === "Picanha")!.stockQty;
    sendOrder({ restaurantId, actor: waiter, orderId: order.orderId });
    const afterSend = listIngredients(restaurantId).find((i) => i.name === "Picanha")!.stockQty;
    expect(afterSend).toBeLessThan(beforeStock);

    expectApiError(
      () => voidOrderItem({ restaurantId, actor: waiter, itemId: added.itemId, reason: "Cliente desistiu" }),
      /gestão|permiss/i,
    );
    voidOrderItem({ restaurantId, actor: manager, itemId: added.itemId, reason: "Cliente desistiu" });
    const afterVoid = listIngredients(restaurantId).find((i) => i.name === "Picanha")!.stockQty;
    expect(afterVoid).toBeCloseTo(beforeStock, 5);
    const detail = getOrderDetail(restaurantId, order.orderId);
    expect(detail.items[0].status).toBe("void");
    expect(detail.totals.totalCents).toBe(0);

    expectApiError(
      () => cancelOrder({ restaurantId, actor: waiter, orderId: order.orderId, reason: "Teste" }),
      /gestão|permiss/i,
    );
    cancelOrder({ restaurantId, actor: manager, orderId: order.orderId, reason: "Mesa desistiu" });
    expect(getOrderDetail(restaurantId, order.orderId).status).toBe("cancelled");
  });

  it("rejects kitchen access for unauthenticated roles on state changes", () => {
    // Chefs cannot record payments (sala operation).
    const snapshot = getFloorSnapshot(restaurantId);
    const t06 = snapshot.tables.find((t) => t.code === "T06")!;
    const order = openOrder({ restaurantId, actor: waiter, tableId: t06.id, guests: 2 });
    expectApiError(
      () => addPayment({ restaurantId, actor: chef, orderId: order.orderId, amountCents: 100, method: "cash", idempotencyKey: "chef-pay" }),
      /permiss/i,
    );
    cancelOrder({ restaurantId, actor: manager, orderId: order.orderId, reason: "Teste de permissões" });
  });
});

describe("reservations", () => {
  it("prevents double booking on the same table and slot", () => {
    const restaurant = get<{ id: number }>("SELECT id FROM restaurants LIMIT 1")!;
    const t05 = get<{ id: number }>("SELECT id FROM tables WHERE code='T05'")!;
    expectApiError(
      () =>
        createReservation({
          restaurantId: restaurant.id,
          data: {
            name: "Teste Conflito",
            email: "conflito@example.pt",
            phone: "912000000",
            date: localDate(0),
            time: "20:00",
            partySize: 2,
            tableId: t05.id,
          },
        }),
      /reservada|conflito/i,
    );
  });

  it("auto-assigns a free table and exposes availability", () => {
    const restaurant = get<{ id: number }>("SELECT id FROM restaurants LIMIT 1")!;
    const result = createReservation({
      restaurantId: restaurant.id,
      data: {
        name: "Marta Teste",
        email: "marta.teste@example.pt",
        phone: "913111222",
        date: localDate(1),
        time: "21:00",
        partySize: 2,
        note: "Junto à janela",
      },
    });
    expect(result.reservation.code).toMatch(/^RSV-\d+$/);
    expect(result.assignedTable).toMatch(/^T\d{2}$/);
    expect(result.reservation.status).toBe("pending");

    const slots = availabilityForDate(restaurant.id, localDate(1), 2);
    expect(slots.length).toBe(13);
    expect(slots.some((s) => s.availableTables > 0)).toBe(true);

    const second = createReservation({
      restaurantId: restaurant.id,
      data: {
        name: "Outro Cliente",
        email: "outro@example.pt",
        phone: "913111333",
        date: localDate(1),
        time: "21:00",
        partySize: 2,
      },
    });
    expect(second.assignedTable).not.toBe(result.assignedTable);
  });

  it("rejects reservations outside service hours or in the past", () => {
    const restaurant = get<{ id: number }>("SELECT id FROM restaurants LIMIT 1")!;
    const base = { name: "Fora de Hora", email: "fora@example.pt", phone: "913111444", partySize: 2 };
    expectApiError(
      () => createReservation({ restaurantId: restaurant.id, data: { ...base, date: localDate(1), time: "16:00" } }),
      /fora do serviço/i,
    );
    expectApiError(
      () => createReservation({ restaurantId: restaurant.id, data: { ...base, date: localDate(-1), time: "20:00" } }),
      /passada/i,
    );
  });
});

describe("reports", () => {
  it("distinguishes confirmed, recorded and open balances", () => {
    const report = getReports(restaurantId, localDate(-2), localDate(0));
    expect(report.ordersClosed).toBeGreaterThanOrEqual(11);
    expect(report.grossSalesCents).toBeGreaterThan(0);
    expect(report.netSalesCents).toBeLessThan(report.grossSalesCents);
    expect(report.taxCents).toBeGreaterThan(0);
    expect(report.confirmedCents).toBeGreaterThan(0);
    expect(report.openOrders.count).toBeGreaterThan(0);
    expect(report.openOrders.balanceCents).toBeGreaterThan(0);
    expect(report.byDay).toHaveLength(3);
    expect(report.byProduct.length).toBeGreaterThan(5);
    expect(report.byMethod.some((m) => m.method === "card")).toBe(true);
    expect(report.averageTicketCents).toBeGreaterThan(0);
  });

  it("never counts open orders as received revenue", () => {
    const closed = all<{ total: number }>(
      "SELECT COALESCE(SUM(total_cents),0) AS total FROM orders WHERE restaurant_id=? AND status='paid'",
      restaurantId,
    )[0].total;
    const report = getReports(restaurantId, localDate(-30), localDate(0));
    expect(report.grossSalesCents).toBe(Number(closed));
  });
});
