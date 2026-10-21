import "server-only";
import { all, get, run, transaction, bool } from "./db";
import { computeOrderTotals, type OrderTotals } from "./pricing";
import { nowIso, localDate } from "./dates";
import { getRestaurant } from "./restaurant";
import { recordAudit } from "./audit";
import { ApiError, badRequest, conflict, forbidden, notFound } from "./api";
import type { TableDetailPayload } from "./public-types";
import type {
  FloorSnapshot,
  KitchenItem,
  KitchenTicket,
  OrderDetail,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
  Role,
  SessionUser,
  TableStatus,
  TableSummary,
  Zone,
} from "./types";

const OPEN_ORDER_STATUSES = "('open','sent','partially_ready','ready','served','awaiting_payment')";

interface OrderRow {
  id: number;
  restaurant_id: number;
  table_id: number;
  number: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  guests: number;
  waiter_id: number | null;
  notes: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  net_sales_cents: number;
  service_cents: number;
  total_cents: number;
  paid_cents: number;
  opened_at: string;
  closed_at: string | null;
  table_code: string;
  zone_name: string;
  waiter_name: string | null;
}

function parseModifiers(json: string): { id: number; name: string; priceDeltaCents: number }[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m.name === "string")
      .map((m) => ({ id: Number(m.id) || 0, name: String(m.name), priceDeltaCents: Number(m.priceDeltaCents) || 0 }));
  } catch {
    return [];
  }
}

function orderRow(restaurantId: number, orderId: number): OrderRow | undefined {
  return get<OrderRow>(
    `SELECT o.*, t.code AS table_code, z.name AS zone_name, u.name AS waiter_name
     FROM orders o
     JOIN tables t ON t.id = o.table_id
     JOIN zones z ON z.id = t.zone_id
     LEFT JOIN users u ON u.id = o.waiter_id
     WHERE o.id = ? AND o.restaurant_id = ?`,
    orderId,
    restaurantId,
  );
}

export function getOrderDetail(restaurantId: number, orderId: number): OrderDetail {
  const row = orderRow(restaurantId, orderId);
  if (!row) throw notFound("Comanda não encontrada");

  const itemRows = all<{
    id: number;
    product_id: number | null;
    name: string;
    unit_price_cents: number;
    qty: number;
    notes: string;
    status: OrderItem["status"];
    modifiers_json: string;
    course: string;
    created_at: string;
    sent_at: string | null;
    started_at: string | null;
    ready_at: string | null;
    served_at: string | null;
  }>("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC", orderId);

  const items: OrderItem[] = itemRows.map((i) => {
    const modifiers = parseModifiers(i.modifiers_json);
    return {
      id: i.id,
      productId: i.product_id,
      name: i.name,
      unitPriceCents: i.unit_price_cents,
      qty: i.qty,
      notes: i.notes,
      status: i.status,
      modifiers,
      course: i.course,
      createdAt: i.created_at,
      sentAt: i.sent_at,
      startedAt: i.started_at,
      readyAt: i.ready_at,
      servedAt: i.served_at,
      lineTotalCents: (i.unit_price_cents + modifiers.reduce((s, m) => s + m.priceDeltaCents, 0)) * i.qty,
    };
  });

  const payments = all<{
    id: number;
    amount_cents: number;
    method: PaymentMethod;
    status: "recorded" | "confirmed" | "refunded";
    reference: string | null;
    created_at: string;
    confirmed_at: string | null;
    actor_name: string | null;
    confirmed_by_name: string | null;
  }>(
    `SELECT p.id,p.amount_cents,p.method,p.status,p.reference,p.created_at,p.confirmed_at,
            a.name AS actor_name, c.name AS confirmed_by_name
     FROM payments p
     LEFT JOIN users a ON a.id = p.actor_id
     LEFT JOIN users c ON c.id = p.confirmed_by
     WHERE p.order_id = ? ORDER BY p.id ASC`,
    orderId,
  ).map((p) => ({
    id: p.id,
    amountCents: p.amount_cents,
    method: p.method,
    status: p.status,
    reference: p.reference,
    createdAt: p.created_at,
    confirmedAt: p.confirmed_at,
    confirmedByName: p.confirmed_by_name,
    actorName: p.actor_name,
  }));

  const events = all<{ id: number; type: string; detail: string; actor_name: string | null; created_at: string }>(
    `SELECT e.id, e.type, e.detail, u.name AS actor_name, e.created_at
     FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.order_id = ? ORDER BY e.id ASC`,
    orderId,
  ).map((e) => ({ id: e.id, type: e.type, detail: e.detail, actorName: e.actor_name, createdAt: e.created_at }));

  const paidCents = payments.filter((p) => p.status !== "refunded").reduce((s, p) => s + p.amountCents, 0);
  const restaurant = getRestaurant(restaurantId);

  return {
    id: row.id,
    number: row.number,
    tableId: row.table_id,
    tableCode: row.table_code,
    zoneName: row.zone_name,
    status: row.status,
    paymentStatus: row.payment_status,
    guests: row.guests,
    waiterName: row.waiter_name ?? "—",
    notes: row.notes,
    items,
    payments,
    events,
    totals: {
      subtotalCents: row.subtotal_cents,
      discountCents: row.discount_cents,
      taxCents: row.tax_cents,
      netSalesCents: row.net_sales_cents,
      serviceCents: row.service_cents,
      totalCents: row.total_cents,
      paidCents,
      balanceCents: Math.max(0, row.total_cents - paidCents),
    },
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    restaurant: {
      taxRateBps: restaurant.taxRateBps,
      pricesIncludeTax: restaurant.pricesIncludeTax,
      serviceChargeBps: restaurant.serviceChargeBps,
      currency: restaurant.currency,
    },
  };
}

export function getOpenOrderForTable(restaurantId: number, tableId: number): { id: number; number: number } | null {
  const row = get<{ id: number; number: number }>(
    `SELECT id, number FROM orders
     WHERE restaurant_id = ? AND table_id = ? AND status IN ${OPEN_ORDER_STATUSES}
     ORDER BY id DESC LIMIT 1`,
    restaurantId,
    tableId,
  );
  return row ?? null;
}

export function getFloorSnapshot(restaurantId: number): FloorSnapshot {
  const zones: Zone[] = all<{ id: number; name: string; slug: string }>(
    "SELECT id, name, slug FROM zones WHERE restaurant_id = ? ORDER BY sort_order, id",
    restaurantId,
  ).map((zone) => ({ id: Number(zone.id), name: String(zone.name), slug: String(zone.slug) }));
  const tableRows = all<{
    id: number;
    code: string;
    seats: number;
    shape: "round" | "rect";
    pos_x: number;
    pos_z: number;
    rotation: number;
    status: TableStatus;
    zone_id: number;
    zone_name: string;
  }>(
    `SELECT t.id,t.code,t.seats,t.shape,t.pos_x,t.pos_z,t.rotation,t.status,t.zone_id,z.name AS zone_name
     FROM tables t JOIN zones z ON z.id = t.zone_id
     WHERE t.restaurant_id = ? ORDER BY t.code`,
    restaurantId,
  );

  const openOrders = all<{
    id: number;
    number: number;
    table_id: number;
    status: OrderStatus;
    payment_status: PaymentStatus;
    guests: number;
    total_cents: number;
    opened_at: string;
    waiter_name: string | null;
    item_count: number;
    ready_count: number;
  }>(
    `SELECT o.id,o.number,o.table_id,o.status,o.payment_status,o.guests,o.total_cents,o.opened_at,
            u.name AS waiter_name,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.status <> 'void') AS item_count,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.status = 'ready') AS ready_count
     FROM orders o LEFT JOIN users u ON u.id = o.waiter_id
     WHERE o.restaurant_id = ? AND o.status IN ${OPEN_ORDER_STATUSES}`,
    restaurantId,
  );
  const orderByTable = new Map(openOrders.map((o) => [o.table_id, o]));

  const today = localDate(0);
  const reservationRows = all<{
    id: number;
    table_id: number | null;
    time: string;
    party_size: number;
    status: string;
    customer_name: string;
  }>(
    `SELECT r.id,r.table_id,r.time,r.party_size,r.status,c.name AS customer_name
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.restaurant_id = ? AND r.date = ? AND r.status IN ('pending','confirmed','seated')
     ORDER BY r.time ASC`,
    restaurantId,
    today,
  );
  const reservationByTable = new Map<number, (typeof reservationRows)[number]>();
  for (const r of reservationRows) {
    if (r.table_id != null && !reservationByTable.has(r.table_id)) reservationByTable.set(r.table_id, r);
  }

  const tables: TableSummary[] = tableRows.map((t) => {
    const order = orderByTable.get(t.id);
    const reservation = reservationByTable.get(t.id);
    return {
      id: t.id,
      code: t.code,
      seats: t.seats,
      shape: t.shape,
      x: t.pos_x,
      z: t.pos_z,
      rotation: t.rotation,
      status: t.status,
      zoneId: t.zone_id,
      zoneName: t.zone_name,
      order: order
        ? {
            id: order.id,
            number: order.number,
            status: order.status,
            paymentStatus: order.payment_status,
            guests: order.guests,
            totalCents: order.total_cents,
            openedAt: order.opened_at,
            waiterName: order.waiter_name ?? "—",
            itemCount: Number(order.item_count),
            readyCount: Number(order.ready_count),
          }
        : null,
      reservation: reservation
        ? {
            id: reservation.id,
            time: reservation.time,
            partySize: reservation.party_size,
            customerName: reservation.customer_name,
            status: reservation.status as ReservationStatus,
          }
        : null,
    };
  });

  const counts = {
    available: 0,
    reserved: 0,
    occupied: 0,
    orderPending: 0,
    awaitingPayment: 0,
    cleaning: 0,
  };
  for (const t of tables) {
    if (t.status === "available") counts.available++;
    else if (t.status === "reserved") counts.reserved++;
    else if (t.status === "occupied") counts.occupied++;
    else if (t.status === "order_pending") counts.orderPending++;
    else if (t.status === "awaiting_payment") counts.awaitingPayment++;
    else if (t.status === "cleaning") counts.cleaning++;
  }

  const guests = tables.reduce((sum, t) => sum + (t.status === "occupied" || t.status === "order_pending" || t.status === "awaiting_payment" ? (t.order?.guests ?? 0) : 0), 0);
  const openRevenueCents = tables.reduce((sum, t) => sum + (t.order?.totalCents ?? 0), 0);

  return {
    tables,
    zones,
    serverTime: nowIso(),
    stats: { ...counts, guests, openRevenueCents },
  };
}

export function getTableDetail(restaurantId: number, tableId: number): TableDetailPayload {
  const snapshot = getFloorSnapshot(restaurantId);
  const table = snapshot.tables.find((t) => t.id === tableId);
  if (!table) throw notFound("Mesa não encontrada");
  const order = table.order ? getOrderDetail(restaurantId, table.order.id) : null;
  const upcomingReservations = all<{
    id: number;
    date: string;
    time: string;
    party_size: number;
    status: string;
    customer_name: string;
    note: string;
  }>(
    `SELECT r.id,r.date,r.time,r.party_size,r.status,c.name AS customer_name,r.note
     FROM reservations r JOIN customers c ON c.id = r.customer_id
     WHERE r.restaurant_id = ? AND r.table_id = ? AND r.date >= ? AND r.status IN ('pending','confirmed')
     ORDER BY r.date, r.time LIMIT 5`,
    restaurantId,
    tableId,
    localDate(0),
  ).map((r) => ({
    id: r.id,
    date: r.date,
    time: r.time,
    partySize: r.party_size,
    status: r.status,
    customerName: r.customer_name,
    note: r.note,
  }));
  return { table, order, upcomingReservations };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function assertOrderMutable(order: OrderRow): void {
  if (order.status === "paid" || order.status === "cancelled") {
    throw conflict("Esta comanda já está fechada.");
  }
}

function recalcOrder(orderId: number, restaurantId: number): OrderTotals {
  const order = orderRow(restaurantId, orderId);
  if (!order) throw notFound("Comanda não encontrada");
  const items = all<{ unit_price_cents: number; qty: number; modifiers_json: string }>(
    "SELECT unit_price_cents, qty, modifiers_json FROM order_items WHERE order_id = ? AND status <> 'void'",
    orderId,
  );
  const config = getRestaurant(restaurantId);
  const totals = computeOrderTotals(
    {
      lines: items.map((i) => ({
        unitPriceCents: i.unit_price_cents + parseModifiers(i.modifiers_json).reduce((s, m) => s + m.priceDeltaCents, 0),
        qty: i.qty,
      })),
      discountCents: order.discount_cents,
    },
    { taxRateBps: config.taxRateBps, pricesIncludeTax: config.pricesIncludeTax, serviceChargeBps: config.serviceChargeBps },
  );
  const paid = get<{ paid: number }>(
    "SELECT COALESCE(SUM(amount_cents),0) AS paid FROM payments WHERE order_id = ? AND status <> 'refunded'",
    orderId,
  );
  run(
    `UPDATE orders SET subtotal_cents=?,discount_cents=?,tax_cents=?,net_sales_cents=?,service_cents=?,total_cents=?,paid_cents=?,updated_at=?
     WHERE id=?`,
    totals.subtotalCents,
    totals.discountCents,
    totals.taxCents,
    totals.netSalesCents,
    totals.serviceCents,
    totals.totalCents,
    Number(paid?.paid ?? 0),
    nowIso(),
    orderId,
  );
  return totals;
}

function refreshOrderStatus(orderId: number, restaurantId: number): OrderStatus {
  const order = orderRow(restaurantId, orderId);
  if (!order) throw notFound("Comanda não encontrada");
  if (order.status === "paid" || order.status === "cancelled") return order.status;

  const items = all<{ status: string }>("SELECT status FROM order_items WHERE order_id = ? AND status <> 'void'", orderId);
  const kitchen = items.filter((i) => ["sent", "preparing", "ready"].includes(i.status));
  const served = items.filter((i) => i.status === "served");
  let next: OrderStatus = order.status;

  if (order.payment_status === "recorded" || order.payment_status === "pending" || order.status === "awaiting_payment") {
    next = "awaiting_payment";
  } else if (items.length === 0) {
    next = "open";
  } else if (kitchen.length === 0 && served.length === items.length) {
    next = "served";
  } else if (kitchen.length === 0 && served.length === 0) {
    next = "open";
  } else if (kitchen.every((i) => i.status === "ready") && kitchen.length > 0) {
    next = "ready";
  } else if (kitchen.some((i) => i.status === "ready")) {
    next = "partially_ready";
  } else {
    next = "sent";
  }

  run("UPDATE orders SET status=?, updated_at=? WHERE id=?", next, nowIso(), orderId);
  return next;
}

export function syncTableStatus(tableId: number, restaurantId: number): TableStatus {
  const table = get<{ status: TableStatus }>("SELECT status FROM tables WHERE id = ? AND restaurant_id = ?", tableId, restaurantId);
  if (!table) throw notFound("Mesa não encontrada");

  const order = get<{ id: number; status: OrderStatus; payment_status: PaymentStatus }>(
    `SELECT id,status,payment_status FROM orders WHERE table_id=? AND restaurant_id=? AND status IN ${OPEN_ORDER_STATUSES} ORDER BY id DESC LIMIT 1`,
    tableId,
    restaurantId,
  );

  let next: TableStatus;
  if (!order) {
    if (table.status === "cleaning") {
      next = "cleaning";
    } else {
      const reserved = get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM reservations
         WHERE table_id=? AND restaurant_id=? AND date=? AND status IN ('pending','confirmed')`,
        tableId,
        restaurantId,
        localDate(0),
      );
      next = Number(reserved?.c ?? 0) > 0 ? "reserved" : "available";
    }
  } else if (order.payment_status === "recorded" || order.payment_status === "pending" || order.status === "awaiting_payment") {
    next = "awaiting_payment";
  } else {
    const pendingItems = get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM order_items WHERE order_id=? AND status IN ('sent','preparing','ready')",
      order.id,
    );
    next = Number(pendingItems?.c ?? 0) > 0 ? "order_pending" : "occupied";
  }

  run("UPDATE tables SET status=?, updated_at=? WHERE id=?", next, nowIso(), tableId);
  return next;
}

function assertRestaurantTable(restaurantId: number, tableId: number) {
  const table = get<{ id: number; code: string; seats: number; status: TableStatus }>(
    "SELECT id, code, seats, status FROM tables WHERE id=? AND restaurant_id=?",
    tableId,
    restaurantId,
  );
  if (!table) throw notFound("Mesa não encontrada");
  return table;
}

export function openOrder(input: {
  restaurantId: number;
  actor: SessionUser;
  tableId: number;
  guests: number;
  notes?: string;
}): { orderId: number; number: number } {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden();
  if (input.actor.restaurantId !== input.restaurantId) throw forbidden();
  const table = assertRestaurantTable(input.restaurantId, input.tableId);
  if (table.status === "cleaning") throw conflict("A mesa está em limpeza. Liberte-a antes de abrir comanda.");
  const guests = Math.trunc(input.guests);
  if (guests < 1 || guests > 30) throw badRequest("Número de pessoas inválido.");

  return transaction(() => {
    const existing = getOpenOrderForTable(input.restaurantId, input.tableId);
    if (existing) throw conflict(`A mesa ${table.code} já tem a comanda #${existing.number}.`);

    const maxRow = get<{ n: number | null }>("SELECT MAX(number) AS n FROM orders WHERE restaurant_id = ?", input.restaurantId);
    const number = Number(maxRow?.n ?? 1000) + 1;
    const res = run(
      `INSERT INTO orders (restaurant_id,table_id,number,status,payment_status,guests,waiter_id,notes,opened_at,updated_at)
       VALUES (?,?,?,'open','unpaid',?,?,?,?,?)`,
      input.restaurantId,
      input.tableId,
      number,
      guests,
      input.actor.id,
      (input.notes ?? "").slice(0, 300),
      nowIso(),
      nowIso(),
    );
    const orderId = Number(res.lastInsertRowid);
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      orderId,
      input.restaurantId,
      "opened",
      `Comanda #${number} aberta para ${table.code} com ${guests} pax`,
      input.actor.id,
      nowIso(),
    );
    run("UPDATE tables SET status='occupied', updated_at=? WHERE id=?", nowIso(), input.tableId);
    const reservation = get<{ id: number }>(
      `SELECT id FROM reservations WHERE restaurant_id=? AND table_id=? AND date=? AND status IN ('pending','confirmed') ORDER BY time LIMIT 1`,
      input.restaurantId,
      input.tableId,
      localDate(0),
    );
    if (reservation) {
      run("UPDATE reservations SET status='seated', updated_at=? WHERE id=?", nowIso(), reservation.id);
    }
    recordAudit(input.actor, "order.open", "order", orderId, `Comanda #${number} aberta (${table.code}, ${guests} pax)`);
    return { orderId, number };
  });
}

export function addOrderItem(input: {
  restaurantId: number;
  actor: SessionUser;
  orderId: number;
  productId: number;
  qty: number;
  notes?: string;
  modifierIds?: number[];
}): { itemId: number } {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden();
  const qty = Math.trunc(input.qty);
  if (qty < 1 || qty > 20) throw badRequest("Quantidade deve estar entre 1 e 20.");

  return transaction(() => {
    const order = orderRow(input.restaurantId, input.orderId);
    if (!order) throw notFound("Comanda não encontrada");
    assertOrderMutable(order);
    const product = get<{ id: number; name: string; price_cents: number; available: number; course: string }>(
      "SELECT id,name,price_cents,available,course FROM products WHERE id=? AND restaurant_id=?",
      input.productId,
      input.restaurantId,
    );
    if (!product) throw notFound("Produto não encontrado");
    if (!bool(product.available)) throw conflict(`"${product.name}" está indisponível.`);

    const ids = (input.modifierIds ?? []).slice(0, 8);
    const modifiers = ids.length
      ? all<{ id: number; name: string; price_delta_cents: number }>(
          `SELECT id,name,price_delta_cents FROM modifiers WHERE restaurant_id=? AND active=1 AND id IN (${ids.map(() => "?").join(",")})`,
          input.restaurantId,
          ...ids,
        ).map((m) => ({ id: m.id, name: m.name, priceDeltaCents: m.price_delta_cents }))
      : [];
    if (modifiers.length !== ids.length) throw badRequest("Modificador inválido.");

    const res = run(
      `INSERT INTO order_items (order_id,product_id,name,unit_price_cents,qty,notes,status,modifiers_json,course,created_at)
       VALUES (?,?,?,?,?,?,'draft',?,?,?)`,
      input.orderId,
      product.id,
      product.name,
      product.price_cents,
      qty,
      (input.notes ?? "").slice(0, 280),
      JSON.stringify(modifiers),
      product.course,
      nowIso(),
    );
    const itemId = Number(res.lastInsertRowid);
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      input.orderId,
      input.restaurantId,
      "item_added",
      `${qty}× ${product.name} adicionado à comanda`,
      input.actor.id,
      nowIso(),
    );
    recalcOrder(input.orderId, input.restaurantId);
    syncTableStatus(order.table_id, input.restaurantId);
    return { itemId };
  });
}

export function updateOrderItem(input: {
  restaurantId: number;
  actor: SessionUser;
  itemId: number;
  qty?: number;
  notes?: string;
}): void {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden();
  transaction(() => {
    const item = get<{ id: number; order_id: number; status: string; qty: number; name: string }>(
      "SELECT id, order_id, status, qty, name FROM order_items WHERE id = ?",
      input.itemId,
    );
    if (!item) throw notFound("Artigo não encontrado");
    const order = orderRow(input.restaurantId, item.order_id);
    if (!order) throw notFound("Comanda não encontrada");
    assertOrderMutable(order);
    if (item.status === "served") throw conflict("Artigos já servidos não podem ser alterados.");
    if (input.qty != null) {
      if (item.status !== "draft") throw conflict("Só é possível alterar quantidades antes de enviar para a cozinha.");
      const qty = Math.trunc(input.qty);
      if (qty < 1 || qty > 20) throw badRequest("Quantidade inválida.");
      run("UPDATE order_items SET qty=? WHERE id=?", qty, input.itemId);
      run(
        "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
        item.order_id,
        input.restaurantId,
        "item_updated",
        `Quantidade de ${item.name} alterada de ${item.qty} para ${qty}`,
        input.actor.id,
        nowIso(),
      );
    }
    if (input.notes != null) {
      run("UPDATE order_items SET notes=? WHERE id=?", input.notes.slice(0, 280), input.itemId);
    }
    recalcOrder(item.order_id, input.restaurantId);
  });
}

function reverseStockForItem(orderId: number, restaurantId: number, itemId: number, actor: SessionUser, at: string) {
  const item = get<{ product_id: number | null; qty: number; stock_deducted: number }>(
    "SELECT product_id, qty, stock_deducted FROM order_items WHERE id = ?",
    itemId,
  );
  if (!item || !item.product_id || !item.stock_deducted) return;
  const recipe = all<{ ingredient_id: number; qty: number }>(
    "SELECT ingredient_id, qty FROM product_ingredients WHERE product_id = ?",
    item.product_id,
  );
  for (const line of recipe) {
    const add = line.qty * item.qty;
    run("UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?", add, line.ingredient_id);
    run(
      "INSERT INTO stock_movements (restaurant_id,ingredient_id,delta,reason,order_id,actor_id,created_at) VALUES (?,?,?,?,?,?,?)",
      restaurantId,
      line.ingredient_id,
      add,
      `Reversão de stock — artigo anulado (#${orderId})`,
      orderId,
      actor.id,
      at,
    );
  }
  run("UPDATE order_items SET stock_deducted = 0 WHERE id = ?", itemId);
}

export function voidOrderItem(input: {
  restaurantId: number;
  actor: SessionUser;
  itemId: number;
  reason: string;
}): void {
  transaction(() => {
    const item = get<{ id: number; order_id: number; status: string; name: string; qty: number }>(
      "SELECT id, order_id, status, name, qty FROM order_items WHERE id = ?",
      input.itemId,
    );
    if (!item) throw notFound("Artigo não encontrado");
    const order = orderRow(input.restaurantId, item.order_id);
    if (!order) throw notFound("Comanda não encontrada");
    assertOrderMutable(order);
    if (item.status === "void") throw conflict("Artigo já anulado.");
    if (item.status !== "draft" && input.actor.role !== "manager") throw forbidden("Anular artigos enviados exige autorização de gestão.");
    if (item.status === "served") throw conflict("Artigos servidos exigem um ajuste de gestão.");

    run(
      "UPDATE order_items SET status='void', void_reason=?, served_at=NULL WHERE id=?",
      input.reason.slice(0, 280),
      input.itemId,
    );
    if (item.status !== "draft") reverseStockForItem(item.order_id, input.restaurantId, input.itemId, input.actor, nowIso());
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      item.order_id,
      input.restaurantId,
      "item_void",
      `${item.qty}× ${item.name} anulado — ${input.reason}`,
      input.actor.id,
      nowIso(),
    );
    recalcOrder(item.order_id, input.restaurantId);
    refreshOrderStatus(item.order_id, input.restaurantId);
    syncTableStatus(order.table_id, input.restaurantId);
    recordAudit(input.actor, "order_item.void", "order_item", item.id, `Anulado ${item.name} — ${input.reason}`);
  });
}

function deductStockForOrder(orderId: number, restaurantId: number, actor: SessionUser, at: string): void {
  const items = all<{ id: number; product_id: number | null; qty: number; name: string }>(
    "SELECT id, product_id, qty, name FROM order_items WHERE order_id = ? AND status <> 'void' AND stock_deducted = 0",
    orderId,
  );
  for (const item of items) {
    if (!item.product_id) continue;
    const recipe = all<{ ingredient_id: number; qty: number }>(
      "SELECT ingredient_id, qty FROM product_ingredients WHERE product_id = ?",
      item.product_id,
    );
    for (const line of recipe) {
      const delta = -(line.qty * item.qty);
      run("UPDATE ingredients SET stock_qty = stock_qty + ? WHERE id = ?", delta, line.ingredient_id);
      run(
        "INSERT INTO stock_movements (restaurant_id,ingredient_id,delta,reason,order_id,actor_id,created_at) VALUES (?,?,?,?,?,?,?)",
        restaurantId,
        line.ingredient_id,
        delta,
        `Consumo — comanda #${orderId}`,
        orderId,
        actor.id,
        at,
      );
    }
    run("UPDATE order_items SET stock_deducted=1 WHERE id=?", item.id);
  }
}

export function sendOrder(input: { restaurantId: number; actor: SessionUser; orderId: number }): { sentCount: number } {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden();
  return transaction(() => {
    const order = orderRow(input.restaurantId, input.orderId);
    if (!order) throw notFound("Comanda não encontrada");
    assertOrderMutable(order);
    const drafts = all<{ id: number; name: string; qty: number }>(
      "SELECT id,name,qty FROM order_items WHERE order_id=? AND status='draft'",
      input.orderId,
    );
    // Idempotency guard: a repeated send never duplicates kitchen tickets.
    if (drafts.length === 0) throw conflict("Não há artigos novos para enviar para a cozinha.");

    const at = nowIso();
    for (const item of drafts) {
      run("UPDATE order_items SET status='sent', sent_at=? WHERE id=?", at, item.id);
      run(
        "INSERT INTO kitchen_events (restaurant_id,order_id,order_item_id,from_status,to_status,actor_id,created_at) VALUES (?,?,?,?,?,?,?)",
        input.restaurantId,
        input.orderId,
        item.id,
        "draft",
        "sent",
        input.actor.id,
        at,
      );
    }
    deductStockForOrder(input.orderId, input.restaurantId, input.actor, at);
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      input.orderId,
      input.restaurantId,
      "sent",
      `${drafts.length} linha(s) enviadas para a cozinha`,
      input.actor.id,
      at,
    );
    recalcOrder(input.orderId, input.restaurantId);
    refreshOrderStatus(input.orderId, input.restaurantId);
    syncTableStatus(order.table_id, input.restaurantId);
    recordAudit(input.actor, "order.send", "order", input.orderId, `${drafts.length} linha(s) enviadas (comanda #${order.number})`);
    return { sentCount: drafts.length };
  });
}

const KITCHEN_TRANSITIONS: Record<string, string[]> = {
  sent: ["preparing"],
  preparing: ["ready"],
  ready: ["served"],
};

export function setItemStatus(input: {
  restaurantId: number;
  actor: SessionUser;
  itemId: number;
  to: "preparing" | "ready" | "served";
}): void {
  const needed: Role[] = input.to === "served" ? ["manager", "waiter"] : ["manager", "chef"];
  if (!needed.includes(input.actor.role)) throw forbidden();

  transaction(() => {
    const item = get<{ id: number; order_id: number; status: string; name: string }>(
      "SELECT id,order_id,status,name FROM order_items WHERE id=?",
      input.itemId,
    );
    if (!item) throw notFound("Artigo não encontrado");
    const order = orderRow(input.restaurantId, item.order_id);
    if (!order) throw notFound("Comanda não encontrada");
    assertOrderMutable(order);
    if (!KITCHEN_TRANSITIONS[item.status]?.includes(input.to)) {
      throw conflict(`Transição inválida: ${item.status} → ${input.to}.`);
    }
    const at = nowIso();
    const column = input.to === "preparing" ? "started_at" : input.to === "ready" ? "ready_at" : "served_at";
    run(`UPDATE order_items SET status=?, ${column}=? WHERE id=?`, input.to, at, item.id);
    run(
      "INSERT INTO kitchen_events (restaurant_id,order_id,order_item_id,from_status,to_status,actor_id,created_at) VALUES (?,?,?,?,?,?,?)",
      input.restaurantId,
      item.order_id,
      item.id,
      item.status,
      input.to,
      input.actor.id,
      at,
    );
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      item.order_id,
      input.restaurantId,
      `item_${input.to}`,
      `${item.name} → ${input.to}`,
      input.actor.id,
      at,
    );
    refreshOrderStatus(item.order_id, input.restaurantId);
    syncTableStatus(order.table_id, input.restaurantId);
  });
}

export function applyDiscount(input: { restaurantId: number; actor: SessionUser; orderId: number; discountCents: number }): void {
  if (input.actor.role !== "manager") throw forbidden("Apenas a gestão pode aplicar descontos.");
  transaction(() => {
    const order = orderRow(input.restaurantId, input.orderId);
    if (!order) throw notFound("Comanda não encontrada");
    assertOrderMutable(order);
    if (input.discountCents < 0) throw badRequest("Desconto inválido.");
    run("UPDATE orders SET discount_cents=? WHERE id=?", Math.trunc(input.discountCents), input.orderId);
    const totals = recalcOrder(input.orderId, input.restaurantId);
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      input.orderId,
      input.restaurantId,
      "discount",
      `Desconto aplicado: ${(input.discountCents / 100).toFixed(2)} €`,
      input.actor.id,
      nowIso(),
    );
    recordAudit(
      input.actor,
      "order.discount",
      "order",
      input.orderId,
      `Desconto de ${(input.discountCents / 100).toFixed(2)} € (total ${(totals.totalCents / 100).toFixed(2)} €)`,
    );
  });
}

export function addPayment(input: {
  restaurantId: number;
  actor: SessionUser;
  orderId: number;
  amountCents: number;
  method: PaymentMethod;
  reference?: string;
  idempotencyKey?: string;
}): { paymentId: number; duplicate: boolean } {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden();
  const amount = Math.trunc(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest("Valor de pagamento inválido.");
  if (!["cash", "card", "mbway", "voucher", "transfer"].includes(input.method)) throw badRequest("Método inválido.");

  return transaction(() => {
    if (input.idempotencyKey) {
      const existing = get<{ id: number }>("SELECT id FROM payments WHERE idempotency_key = ?", input.idempotencyKey);
      if (existing) return { paymentId: existing.id, duplicate: true };
    }
    const order = orderRow(input.restaurantId, input.orderId);
    if (!order) throw notFound("Comanda não encontrada");
    assertOrderMutable(order);
    const balance = order.total_cents - order.paid_cents;
    if (amount > balance) {
      throw badRequest(`O valor excede o saldo em falta (${(balance / 100).toFixed(2)} €).`);
    }
    const at = nowIso();
    const res = run(
      `INSERT INTO payments (restaurant_id,order_id,amount_cents,method,status,reference,idempotency_key,actor_id,created_at)
       VALUES (?,?,?,?,'recorded',?,?,?,?)`,
      input.restaurantId,
      input.orderId,
      amount,
      input.method,
      (input.reference ?? "").slice(0, 80) || null,
      input.idempotencyKey ?? null,
      input.actor.id,
      at,
    );
    const paymentId = Number(res.lastInsertRowid);
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      input.orderId,
      input.restaurantId,
      "payment_recorded",
      `Pagamento registado (${input.method}) ${(amount / 100).toFixed(2)} € — aguarda confirmação`,
      input.actor.id,
      at,
    );
    recalcOrder(input.orderId, input.restaurantId);
    run("UPDATE orders SET payment_status='recorded', updated_at=? WHERE id=?", at, input.orderId);
    syncTableStatus(order.table_id, input.restaurantId);
    recordAudit(input.actor, "payment.record", "payment", paymentId, `Registo ${(amount / 100).toFixed(2)} € (${input.method}) — comanda #${order.number}`);
    return { paymentId, duplicate: false };
  });
}

export function confirmPayment(input: { restaurantId: number; actor: SessionUser; paymentId: number }): void {
  if (input.actor.role !== "manager") throw forbidden("A confirmação de pagamentos exige autorização de gestão.");
  transaction(() => {
    const payment = get<{ id: number; order_id: number; status: string; amount_cents: number; method: string }>(
      "SELECT id,order_id,status,amount_cents,method FROM payments WHERE id=? AND restaurant_id=?",
      input.paymentId,
      input.restaurantId,
    );
    if (!payment) throw notFound("Pagamento não encontrado");
    if (payment.status === "confirmed") throw conflict("Pagamento já confirmado.");
    if (payment.status === "refunded") throw conflict("Pagamento reembolsado.");
    const order = orderRow(input.restaurantId, payment.order_id);
    if (!order) throw notFound("Comanda não encontrada");

    run("UPDATE payments SET status='confirmed', confirmed_at=?, confirmed_by=? WHERE id=?", nowIso(), input.actor.id, payment.id);
    const remaining = get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM payments WHERE order_id=? AND status='recorded'",
      payment.order_id,
    );
    const totalPaid = get<{ paid: number }>(
      "SELECT COALESCE(SUM(amount_cents),0) AS paid FROM payments WHERE order_id=? AND status IN ('recorded','confirmed')",
      payment.order_id,
    );
    const status = Number(remaining?.c ?? 0) > 0
      ? "recorded"
      : Number(totalPaid?.paid ?? 0) >= order.total_cents
        ? "confirmed"
        : "pending";
    run("UPDATE orders SET payment_status=?, paid_cents=?, updated_at=? WHERE id=?", status, Number(totalPaid?.paid ?? 0), nowIso(), payment.order_id);
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      payment.order_id,
      input.restaurantId,
      "payment_confirmed",
      `Pagamento confirmado ${(payment.amount_cents / 100).toFixed(2)} € (${payment.method})`,
      input.actor.id,
      nowIso(),
    );
    recordAudit(
      input.actor,
      "payment.confirm",
      "payment",
      payment.id,
      `Confirmação de ${(payment.amount_cents / 100).toFixed(2)} € (${payment.method}) — comanda #${order.number}`,
    );
    syncTableStatus(order.table_id, input.restaurantId);
  });
}

export function closeOrder(input: { restaurantId: number; actor: SessionUser; orderId: number }): void {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden();
  transaction(() => {
    const order = orderRow(input.restaurantId, input.orderId);
    if (!order) throw notFound("Comanda não encontrada");
    assertOrderMutable(order);
    const unserved = get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM order_items WHERE order_id=? AND status IN ('draft','sent','preparing','ready')",
      input.orderId,
    );
    if (Number(unserved?.c ?? 0) > 0) throw conflict("Existem artigos por servir ou por enviar para a cozinha.");
    const pending = get<{ c: number }>("SELECT COUNT(*) AS c FROM payments WHERE order_id=? AND status='recorded'", input.orderId);
    if (Number(pending?.c ?? 0) > 0) throw conflict("Existem pagamentos por confirmar. A gestão tem de os confirmar antes de fechar.");
    const paid = get<{ paid: number }>(
      "SELECT COALESCE(SUM(amount_cents),0) AS paid FROM payments WHERE order_id=? AND status='confirmed'",
      input.orderId,
    );
    const paidCents = Number(paid?.paid ?? 0);
    if (paidCents < order.total_cents) {
      throw conflict(`Saldo em falta: ${((order.total_cents - paidCents) / 100).toFixed(2)} €.`);
    }
    const at = nowIso();
    run(
      "UPDATE orders SET status='paid', payment_status='confirmed', paid_cents=?, closed_at=?, updated_at=? WHERE id=?",
      paidCents,
      at,
      at,
      input.orderId,
    );
    run("UPDATE tables SET status='cleaning', updated_at=? WHERE id=?", at, order.table_id);
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      input.orderId,
      input.restaurantId,
      "closed",
      `Conta fechada (${(paidCents / 100).toFixed(2)} €) — mesa em limpeza`,
      input.actor.id,
      at,
    );
    recordAudit(input.actor, "order.close", "order", input.orderId, `Comanda #${order.number} fechada com ${(paidCents / 100).toFixed(2)} €`);
  });
}

export function cancelOrder(input: { restaurantId: number; actor: SessionUser; orderId: number; reason: string }): void {
  if (input.actor.role !== "manager") throw forbidden("Anular comandas exige autorização de gestão.");
  transaction(() => {
    const order = orderRow(input.restaurantId, input.orderId);
    if (!order) throw notFound("Comanda não encontrada");
    assertOrderMutable(order);
    const paid = get<{ c: number }>("SELECT COUNT(*) AS c FROM payments WHERE order_id=?", input.orderId);
    if (Number(paid?.c ?? 0) > 0) throw conflict("Comanda com pagamentos registados não pode ser anulada. Emita um reembolso.");
    const items = all<{ id: number }>("SELECT id FROM order_items WHERE order_id=? AND status<>'void'", input.orderId);
    for (const item of items) {
      reverseStockForItem(input.orderId, input.restaurantId, item.id, input.actor, nowIso());
    }
    run("UPDATE order_items SET status='void' WHERE order_id=?", input.orderId);
    const at = nowIso();
    run("UPDATE orders SET status='cancelled', closed_at=?, updated_at=? WHERE id=?", at, at, input.orderId);
    run("UPDATE tables SET status='cleaning', updated_at=? WHERE id=?", at, order.table_id);
    run(
      "INSERT INTO order_events (order_id,restaurant_id,type,detail,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      input.orderId,
      input.restaurantId,
      "cancelled",
      `Comanda anulada — ${input.reason}`,
      input.actor.id,
      at,
    );
    recordAudit(input.actor, "order.cancel", "order", input.orderId, `Comanda #${order.number} anulada — ${input.reason}`);
  });
}

export function releaseTable(input: { restaurantId: number; actor: SessionUser; tableId: number }): void {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden();
  transaction(() => {
    const table = assertRestaurantTable(input.restaurantId, input.tableId);
    const open = getOpenOrderForTable(input.restaurantId, input.tableId);
    if (open) throw conflict("Feche a comanda antes de libertar a mesa.");
    const reserved = get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM reservations WHERE restaurant_id=? AND table_id=? AND date=? AND status IN ('pending','confirmed')",
      input.restaurantId,
      input.tableId,
      localDate(0),
    );
    const next = Number(reserved?.c ?? 0) > 0 ? "reserved" : "available";
    run("UPDATE tables SET status=?, updated_at=? WHERE id=?", next, nowIso(), input.tableId);
    recordAudit(input.actor, "table.release", "table", input.tableId, `Mesa ${table.code} libertada → ${next}`);
  });
}

export function markTableCleaning(input: { restaurantId: number; actor: SessionUser; tableId: number }): void {
  if (!["manager", "waiter"].includes(input.actor.role)) throw forbidden();
  const table = assertRestaurantTable(input.restaurantId, input.tableId);
  const open = getOpenOrderForTable(input.restaurantId, input.tableId);
  if (open) throw conflict("Feche a comanda antes de marcar a mesa como em limpeza.");
  run("UPDATE tables SET status='cleaning', updated_at=? WHERE id=?", nowIso(), table.id);
  recordAudit(input.actor, "table.cleaning", "table", table.id, `Mesa ${table.code} marcada como em limpeza`);
}

// ---------------------------------------------------------------------------
// Kitchen
// ---------------------------------------------------------------------------

export function listKitchenTickets(restaurantId: number): { tickets: KitchenTicket[]; history: KitchenItem[]; serverTime: string } {
  const rows = all<{
    item_id: number;
    order_id: number;
    order_number: number;
    table_code: string;
    guests: number;
    waiter_name: string | null;
    opened_at: string;
    order_status: OrderStatus;
    name: string;
    qty: number;
    notes: string;
    modifiers_json: string;
    course: string;
    status: "sent" | "preparing" | "ready";
    sent_at: string | null;
    started_at: string | null;
    ready_at: string | null;
    prep_minutes: number;
    priority: number;
  }>(
    `SELECT oi.id AS item_id, o.id AS order_id, o.number AS order_number, t.code AS table_code, o.guests,
            u.name AS waiter_name, o.opened_at, o.status AS order_status, oi.name, oi.qty, oi.notes, oi.modifiers_json,
            oi.course, oi.status, oi.sent_at, oi.started_at, oi.ready_at, COALESCE(p.prep_minutes,12) AS prep_minutes,
            CASE WHEN o.notes LIKE '%anivers%' THEN 1 ELSE 0 END AS priority
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN tables t ON t.id = o.table_id
     LEFT JOIN users u ON u.id = o.waiter_id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.restaurant_id = ? AND o.status NOT IN ('paid','cancelled')
       AND oi.status IN ('sent','preparing','ready')
     ORDER BY oi.sent_at ASC, oi.id ASC`,
    restaurantId,
  );

  const now = Date.now();
  const ticketsMap = new Map<number, KitchenTicket>();
  for (const row of rows) {
    const waitMinutes = row.sent_at ? Math.max(0, Math.floor((now - new Date(row.sent_at).getTime()) / 60_000)) : 0;
    const late = waitMinutes > Number(row.prep_minutes);
    const item: KitchenItem = {
      id: row.item_id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      tableCode: row.table_code,
      name: row.name,
      qty: row.qty,
      notes: row.notes,
      modifiers: parseModifiers(row.modifiers_json),
      course: row.course,
      status: row.status,
      sentAt: row.sent_at,
      startedAt: row.started_at,
      readyAt: row.ready_at,
      servedAt: null,
      waitMinutes,
      late,
      priority: Number(row.priority) || 0,
      prepMinutes: Number(row.prep_minutes),
    };
    const existing = ticketsMap.get(row.order_id);
    if (existing) {
      existing.items.push(item);
      existing.oldestMinutes = Math.max(existing.oldestMinutes, waitMinutes);
      existing.late = existing.late || late;
      existing.priority = Math.max(existing.priority, item.priority);
    } else {
      ticketsMap.set(row.order_id, {
        orderId: row.order_id,
        orderNumber: row.order_number,
        tableCode: row.table_code,
        guests: row.guests,
        waiterName: row.waiter_name ?? "—",
        openedAt: row.opened_at,
        status: row.order_status,
        items: [item],
        oldestMinutes: waitMinutes,
        late,
        priority: item.priority,
      });
    }
  }

  const history = all<{
    id: number;
    order_id: number;
    order_number: number;
    table_code: string;
    name: string;
    qty: number;
    modifiers_json: string;
    sent_at: string | null;
    started_at: string | null;
    ready_at: string | null;
    served_at: string | null;
    prep_minutes: number;
  }>(
    `SELECT oi.id, oi.order_id, o.number AS order_number, t.code AS table_code, oi.name, oi.qty, oi.modifiers_json,
            oi.sent_at, oi.started_at, oi.ready_at, oi.served_at, COALESCE(p.prep_minutes,12) AS prep_minutes
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN tables t ON t.id = o.table_id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.restaurant_id = ? AND oi.status IN ('ready','served')
       AND COALESCE(oi.ready_at, oi.served_at) >= ?
     ORDER BY COALESCE(oi.ready_at, oi.served_at) DESC LIMIT 24`,
    restaurantId,
    new Date(now - 6 * 3_600_000).toISOString(),
  );

  return {
    tickets: [...ticketsMap.values()].sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.oldestMinutes - a.oldestMinutes;
    }),
    history: history.map((h) => {
      const waitMinutes = h.sent_at ? Math.max(0, Math.floor((now - new Date(h.sent_at).getTime()) / 60_000)) : 0;
      return {
        id: h.id,
        orderId: h.order_id,
        orderNumber: h.order_number,
        tableCode: h.table_code,
        name: h.name,
        qty: h.qty,
        notes: "",
        modifiers: parseModifiers(h.modifiers_json),
        course: "main",
        status: "served",
        sentAt: h.sent_at,
        startedAt: h.started_at,
        readyAt: h.ready_at,
        servedAt: h.served_at,
        waitMinutes,
        late: false,
        priority: 0,
        prepMinutes: Number(h.prep_minutes),
      } satisfies KitchenItem;
    }),
    serverTime: nowIso(),
  };
}

export function openOrdersForWaiter(restaurantId: number, waiterId?: number) {
  return all<{
    id: number;
    number: number;
    table_code: string;
    status: OrderStatus;
    guests: number;
    total_cents: number;
    opened_at: string;
    waiter_name: string | null;
    item_count: number;
    ready_count: number;
  }>(
    `SELECT o.id,o.number,t.code AS table_code,o.status,o.guests,o.total_cents,o.opened_at,u.name AS waiter_name,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id AND oi.status<>'void') AS item_count,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id AND oi.status='ready') AS ready_count
     FROM orders o JOIN tables t ON t.id=o.table_id LEFT JOIN users u ON u.id=o.waiter_id
     WHERE o.restaurant_id = ? AND o.status IN ${OPEN_ORDER_STATUSES}
     ${waiterId ? "AND o.waiter_id = ?" : ""}
     ORDER BY o.opened_at ASC`,
    ...(waiterId ? [restaurantId, waiterId] : [restaurantId]),
  );
}

export function tableSummaryForOrder(restaurantId: number, tableId: number): TableSummary | null {
  return getFloorSnapshot(restaurantId).tables.find((t) => t.id === tableId) ?? null;
}

export function orderIdFromTableOrThrow(restaurantId: number, tableId: number): number {
  const order = getOpenOrderForTable(restaurantId, tableId);
  if (!order) throw notFound("A mesa não tem comanda aberta.");
  return order.id;
}

export { ApiError };
