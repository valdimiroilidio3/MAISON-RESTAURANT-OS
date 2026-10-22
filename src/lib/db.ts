import "server-only";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { seedDatabase } from "./seed";
import { reconcileFloorPlan } from "./seed";

/**
 * Server-only data access. Uses Node's built-in SQLite (node:sqlite) so the
 * project has real SQL, constraints, indexes and transactions with zero native
 * dependencies. The repository layer is written so the driver can be swapped for
 * PostgreSQL/Prisma without touching route handlers (see docs/ARCHITECTURE.md).
 */

type SqlParam = string | number | bigint | null | Uint8Array;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'EUR',
  tax_rate_bps INTEGER NOT NULL DEFAULT 2300,
  prices_include_tax INTEGER NOT NULL DEFAULT 1,
  service_charge_bps INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  lunch_hours TEXT NOT NULL DEFAULT '12:00 – 15:00',
  dinner_hours TEXT NOT NULL DEFAULT '19:00 – 23:00',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','waiter','chef')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(restaurant_id, slug)
);

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  zone_id INTEGER NOT NULL REFERENCES zones(id),
  code TEXT NOT NULL,
  seats INTEGER NOT NULL,
  shape TEXT NOT NULL CHECK (shape IN ('round','rect')),
  pos_x REAL NOT NULL,
  pos_z REAL NOT NULL,
  rotation REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','occupied','order_pending','awaiting_payment','cleaning')),
  updated_at TEXT NOT NULL,
  UNIQUE(restaurant_id, code)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(restaurant_id, email);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  table_id INTEGER REFERENCES tables(id),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  party_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','seated','completed','cancelled','no_show')),
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website','phone','walk-in','admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(restaurant_id, date, time);
CREATE INDEX IF NOT EXISTS idx_reservations_table ON reservations(restaurant_id, table_id, date);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(restaurant_id, slug)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  available INTEGER NOT NULL DEFAULT 1,
  allergens TEXT NOT NULL DEFAULT '[]',
  prep_minutes INTEGER NOT NULL DEFAULT 12,
  course TEXT NOT NULL DEFAULT 'main',
  image_url TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(restaurant_id, category_id);

CREATE TABLE IF NOT EXISTS modifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  group_name TEXT NOT NULL DEFAULT 'Extras',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  stock_qty REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  supplier TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(restaurant_id, name)
);

CREATE TABLE IF NOT EXISTS product_ingredients (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  qty REAL NOT NULL CHECK (qty > 0),
  PRIMARY KEY (product_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  delta REAL NOT NULL,
  reason TEXT NOT NULL,
  order_id INTEGER,
  actor_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient ON stock_movements(restaurant_id, ingredient_id, created_at);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id INTEGER NOT NULL REFERENCES tables(id),
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','sent','partially_ready','ready','served','awaiting_payment','paid','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','pending','recorded','confirmed','refunded')),
  guests INTEGER NOT NULL DEFAULT 1,
  waiter_id INTEGER REFERENCES users(id),
  notes TEXT NOT NULL DEFAULT '',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  net_sales_cents INTEGER NOT NULL DEFAULT 0,
  service_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(restaurant_id, number)
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_closed ON orders(restaurant_id, closed_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','preparing','ready','served','void')),
  modifiers_json TEXT NOT NULL DEFAULT '[]',
  course TEXT NOT NULL DEFAULT 'main',
  stock_deducted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  started_at TEXT,
  ready_at TEXT,
  served_at TEXT,
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id, created_at);

CREATE TABLE IF NOT EXISTS kitchen_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kitchen_events_order ON kitchen_events(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','card','mbway','voucher','transfer')),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','confirmed','refunded')),
  reference TEXT,
  idempotency_key TEXT UNIQUE,
  actor_id INTEGER,
  confirmed_at TEXT,
  confirmed_by INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  actor_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(restaurant_id, created_at);
`;

interface GlobalDb {
  __maisonDb?: DatabaseSync;
  __maisonReady?: boolean;
}

const g = globalThis as unknown as GlobalDb;

export function databasePath(): string {
  return process.env.MAISON_DB_PATH ?? path.join(process.cwd(), "data", "maison.db");
}

function initDb(): DatabaseSync {
  const file = databasePath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  const row = db.prepare("SELECT COUNT(*) AS c FROM restaurants").get() as { c: number } | undefined;
  if (!row || Number(row.c) === 0) seedDatabase(db);
  // The floor plan is code, not data: an existing database is reconciled with
  // TABLE_PLAN on every boot (never touching status or orders).
  reconcileFloorPlan(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!g.__maisonDb) {
    g.__maisonDb = initDb();
    g.__maisonReady = true;
  }
  return g.__maisonDb;
}

export function all<T>(sql: string, ...params: SqlParam[]): T[] {
  const stmt: StatementSync = getDb().prepare(sql);
  return stmt.all(...params) as T[];
}

export function get<T>(sql: string, ...params: SqlParam[]): T | undefined {
  const stmt: StatementSync = getDb().prepare(sql);
  return stmt.get(...params) as T | undefined;
}

export function run(sql: string, ...params: SqlParam[]) {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // connection already rolled back
    }
    throw error;
  }
}

export function bool(value: unknown): boolean {
  return Number(value) === 1;
}

export function toBoolParam(value: boolean): number {
  return value ? 1 : 0;
}

export function lastInsertId(result: { lastInsertRowid: number | bigint }): number {
  return Number(result.lastInsertRowid);
}

/** Test helper: drop the cached connection so a fresh DB path can be used. */
export function resetDbForTests(): void {
  try {
    g.__maisonDb?.close();
  } catch {
    // ignore
  }
  g.__maisonDb = undefined;
  g.__maisonReady = undefined;
}
