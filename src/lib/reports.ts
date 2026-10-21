import "server-only";
import { all, get } from "./db";
import { addDaysToDateString } from "./reservations-rules";
import { formatDateTime, localDate, localDateOf, minutesBetween, zonedToUtcIso } from "./dates";
import { badRequest } from "./api";
import type { PaymentMethod, ReportsSummary } from "./types";
import type { AuditEntry } from "./audit";

const SERVICE_MINUTES_PER_DAY =
  150 + 180; /* 12:00–14:30 and 19:00–22:00 — mirrors SERVICE_WINDOWS */

function parseModifiers(json: string): { priceDeltaCents: number }[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((m: { priceDeltaCents?: number }) => ({ priceDeltaCents: Number(m.priceDeltaCents) || 0 })) : [];
  } catch {
    return [];
  }
}

export function validateRange(from: string, to: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw badRequest("Datas inválidas.");
  if (from > to) throw badRequest("A data inicial não pode ser posterior à final.");
  const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000;
  if (days > 120) throw badRequest("Intervalo máximo de 120 dias.");
}

export function getReports(restaurantId: number, from: string, to: string): ReportsSummary {
  validateRange(from, to);
  const startUtc = zonedToUtcIso(from, "00:00");
  const endUtc = zonedToUtcIso(addDaysToDateString(to, 1), "00:00");

  const closed = all<{
    id: number;
    total_cents: number;
    net_sales_cents: number;
    tax_cents: number;
    service_cents: number;
    discount_cents: number;
    guests: number;
    opened_at: string;
    closed_at: string;
  }>(
    `SELECT id,total_cents,net_sales_cents,tax_cents,service_cents,discount_cents,guests,opened_at,closed_at
     FROM orders WHERE restaurant_id=? AND status='paid' AND closed_at>=? AND closed_at<?
     ORDER BY closed_at ASC`,
    restaurantId,
    startUtc,
    endUtc,
  );

  const cancelled = all<{ id: number; total_cents: number; closed_at: string }>(
    `SELECT id,total_cents,closed_at FROM orders
     WHERE restaurant_id=? AND status='cancelled' AND closed_at>=? AND closed_at<?`,
    restaurantId,
    startUtc,
    endUtc,
  );

  const itemRows = all<{
    order_id: number;
    name: string;
    qty: number;
    unit_price_cents: number;
    modifiers_json: string;
    category_name: string | null;
    sent_at: string | null;
    ready_at: string | null;
  }>(
    `SELECT oi.order_id, oi.name, oi.qty, oi.unit_price_cents, oi.modifiers_json,
            c.name AS category_name, oi.sent_at, oi.ready_at
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE o.restaurant_id=? AND o.status='paid' AND o.closed_at>=? AND o.closed_at<? AND oi.status <> 'void'`,
    restaurantId,
    startUtc,
    endUtc,
  );

  const paymentRows = all<{ method: PaymentMethod; status: string; amount: number; count: number }>(
    `SELECT p.method, p.status, SUM(p.amount_cents) AS amount, COUNT(*) AS count
     FROM payments p JOIN orders o ON o.id=p.order_id
     WHERE o.restaurant_id=? AND o.status='paid' AND o.closed_at>=? AND o.closed_at<?
       AND p.status IN ('confirmed','recorded')
     GROUP BY p.method, p.status`,
    restaurantId,
    startUtc,
    endUtc,
  );

  const recordedNow = all<{ method: PaymentMethod; amount: number; count: number }>(
    `SELECT method, SUM(amount_cents) AS amount, COUNT(*) AS count
     FROM payments WHERE restaurant_id=? AND status='recorded' AND created_at>=? AND created_at<?
     GROUP BY method`,
    restaurantId,
    startUtc,
    endUtc,
  );

  const open = get<{ count: number; balance: number }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_cents - paid_cents),0) AS balance
     FROM orders WHERE restaurant_id=? AND status NOT IN ('paid','cancelled')`,
    restaurantId,
  );

  const tables = get<{ count: number }>("SELECT COUNT(*) AS count FROM tables WHERE restaurant_id=?", restaurantId);
  const tableCount = Number(tables?.count ?? 1);

  const grossSalesCents = closed.reduce((s, o) => s + o.total_cents, 0);
  const netSalesCents = closed.reduce((s, o) => s + o.net_sales_cents, 0);
  const taxCents = closed.reduce((s, o) => s + o.tax_cents, 0);
  const serviceCents = closed.reduce((s, o) => s + o.service_cents, 0);
  const discountCents = closed.reduce((s, o) => s + o.discount_cents, 0);
  const guestsServed = closed.reduce((s, o) => s + o.guests, 0);

  const byDayMap = new Map<string, { grossCents: number; orders: number; guests: number }>();
  let days = 0;
  for (let d = from; d <= to; d = addDaysToDateString(d, 1)) {
    byDayMap.set(d, { grossCents: 0, orders: 0, guests: 0 });
    days++;
    if (days > 400) break;
  }
  for (const order of closed) {
    const date = localDateOf(order.closed_at);
    const bucket = byDayMap.get(date);
    if (bucket) {
      bucket.grossCents += order.total_cents;
      bucket.orders += 1;
      bucket.guests += order.guests;
    }
  }

  const productMap = new Map<string, { name: string; category: string; qty: number; grossCents: number }>();
  const categoryMap = new Map<string, { name: string; qty: number; grossCents: number }>();
  let prepSamples = 0;
  let prepMinutes = 0;
  for (const item of itemRows) {
    const modifierSum = parseModifiers(item.modifiers_json).reduce((s, m) => s + m.priceDeltaCents, 0);
    const gross = (item.unit_price_cents + modifierSum) * item.qty;
    const p = productMap.get(item.name) ?? { name: item.name, category: item.category_name ?? "Outros", qty: 0, grossCents: 0 };
    p.qty += item.qty;
    p.grossCents += gross;
    productMap.set(item.name, p);
    const catName = item.category_name ?? "Outros";
    const c = categoryMap.get(catName) ?? { name: catName, qty: 0, grossCents: 0 };
    c.qty += item.qty;
    c.grossCents += gross;
    categoryMap.set(catName, c);
    if (item.sent_at && item.ready_at) {
      prepMinutes += minutesBetween(item.sent_at, item.ready_at);
      prepSamples++;
    }
  }

  const methodTotals = new Map<PaymentMethod, { confirmedCents: number; recordedCents: number; count: number }>();
  for (const row of paymentRows) {
    const entry = methodTotals.get(row.method) ?? { confirmedCents: 0, recordedCents: 0, count: 0 };
    if (row.status === "confirmed") entry.confirmedCents += row.amount;
    else entry.recordedCents += row.amount;
    entry.count += row.count;
    methodTotals.set(row.method, entry);
  }
  for (const row of recordedNow) {
    const entry = methodTotals.get(row.method) ?? { confirmedCents: 0, recordedCents: 0, count: 0 };
    /* recorded payments already counted above are not double-counted because
       they belong to closed orders; this loop covers currently open orders. */
    if (!paymentRows.some((p) => p.method === row.method && p.status === "recorded")) {
      entry.recordedCents += row.amount;
      entry.count += row.count;
    }
    methodTotals.set(row.method, entry);
  }

  const confirmedCents = paymentRows.filter((p) => p.status === "confirmed").reduce((s, p) => s + p.amount, 0);
  const recordedCents = recordedNow.reduce((s, p) => s + p.amount, 0);

  const totalServiceMinutes = closed.reduce((s, o) => s + minutesBetween(o.opened_at, o.closed_at), 0);

  return {
    range: { from, to },
    ordersClosed: closed.length,
    guestsServed,
    grossSalesCents,
    netSalesCents,
    taxCents,
    serviceCents,
    discountCents,
    averageTicketCents: closed.length ? Math.round(grossSalesCents / closed.length) : 0,
    confirmedCents,
    recordedCents,
    pendingCents: Number(open?.balance ?? 0),
    cancelledOrders: cancelled.length,
    averageServiceMinutes: closed.length ? Math.round(totalServiceMinutes / closed.length) : 0,
    occupancyPercent: Math.min(
      100,
      Math.round(((totalServiceMinutes / (tableCount * SERVICE_MINUTES_PER_DAY * Math.max(1, days))) * 100 + Number.EPSILON) * 10) / 10,
    ),
    itemsSold: itemRows.reduce((s, i) => s + i.qty, 0),
    byDay: [...byDayMap.entries()].map(([date, v]) => ({ date, ...v })),
    byProduct: [...productMap.values()].sort((a, b) => b.grossCents - a.grossCents),
    byCategory: [...categoryMap.values()].sort((a, b) => b.grossCents - a.grossCents),
    byMethod: [...methodTotals.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.confirmedCents - a.confirmedCents),
    openOrders: { count: Number(open?.count ?? 0), balanceCents: Number(open?.balance ?? 0) },
    averagePrepMinutes: prepSamples ? Math.round(prepMinutes / prepSamples) : 0,
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildOrdersCsv(restaurantId: number, from: string, to: string): string {
  validateRange(from, to);
  const startUtc = zonedToUtcIso(from, "00:00");
  const endUtc = zonedToUtcIso(addDaysToDateString(to, 1), "00:00");
  const rows = all<{
    number: number;
    table_code: string;
    guests: number;
    waiter_name: string | null;
    subtotal_cents: number;
    discount_cents: number;
    net_sales_cents: number;
    tax_cents: number;
    service_cents: number;
    total_cents: number;
    opened_at: string;
    closed_at: string | null;
    status: string;
    payment_status: string;
    methods: string | null;
  }>(
    `SELECT o.number, t.code AS table_code, o.guests, u.name AS waiter_name, o.subtotal_cents, o.discount_cents,
            o.net_sales_cents, o.tax_cents, o.service_cents, o.total_cents, o.opened_at, o.closed_at, o.status,
            o.payment_status,
            (SELECT GROUP_CONCAT(DISTINCT p.method) FROM payments p WHERE p.order_id=o.id AND p.status IN ('confirmed','recorded')) AS methods
     FROM orders o JOIN tables t ON t.id=o.table_id LEFT JOIN users u ON u.id=o.waiter_id
     WHERE o.restaurant_id=? AND o.closed_at>=? AND o.closed_at<?
     ORDER BY o.closed_at ASC`,
    restaurantId,
    startUtc,
    endUtc,
  );

  const header = [
    "comanda",
    "data_servico",
    "mesa",
    "pax",
    "responsavel",
    "abertura",
    "fecho",
    "subtotal_eur",
    "desconto_eur",
    "vendas_liquidas_eur",
    "iva_eur",
    "servico_eur",
    "total_eur",
    "metodos",
    "estado",
    "estado_pagamento",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.number,
        localDateOf(r.closed_at),
        r.table_code,
        r.guests,
        r.waiter_name ?? "",
        formatDateTime(r.opened_at),
        formatDateTime(r.closed_at),
        (r.subtotal_cents / 100).toFixed(2),
        (r.discount_cents / 100).toFixed(2),
        (r.net_sales_cents / 100).toFixed(2),
        (r.tax_cents / 100).toFixed(2),
        (r.service_cents / 100).toFixed(2),
        (r.total_cents / 100).toFixed(2),
        r.methods ?? "",
        r.status,
        r.payment_status,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function listAudit(restaurantId: number, limit = 60): AuditEntry[] {
  return all<{
    id: number;
    action: string;
    entity: string;
    entity_id: string;
    detail: string;
    actor_name: string | null;
    actor_role: string | null;
    created_at: string;
  }>(
    `SELECT a.id,a.action,a.entity,a.entity_id,a.detail,u.name AS actor_name,u.role AS actor_role,a.created_at
     FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
     WHERE a.restaurant_id=? ORDER BY a.id DESC LIMIT ?`,
    restaurantId,
    limit,
  ).map((a) => ({
    id: a.id,
    action: a.action,
    entity: a.entity,
    entityId: a.entity_id,
    detail: a.detail,
    actorName: a.actor_name,
    actorRole: a.actor_role,
    createdAt: a.created_at,
  }));
}

export function todayRange(): { from: string; to: string } {
  const today = localDate(0);
  return { from: today, to: today };
}

export function last7DaysRange(): { from: string; to: string } {
  return { from: localDate(-6), to: localDate(0) };
}
