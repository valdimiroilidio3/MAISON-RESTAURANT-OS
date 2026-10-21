import "server-only";
import { all, get, run, transaction } from "./db";
import { nowIso } from "./dates";
import { recordAudit } from "./audit";
import { badRequest, forbidden, notFound } from "./api";
import type { Ingredient, InventoryMovement, SessionUser } from "./types";

export function listIngredients(restaurantId: number): Ingredient[] {
  return all<{
    id: number;
    name: string;
    unit: string;
    stock_qty: number;
    reorder_level: number;
    unit_cost_cents: number;
    supplier: string;
  }>(
    `SELECT id,name,unit,stock_qty,reorder_level,unit_cost_cents,supplier
     FROM ingredients WHERE restaurant_id=? ORDER BY (stock_qty <= reorder_level) DESC, name`,
    restaurantId,
  ).map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    stockQty: i.stock_qty,
    reorderLevel: i.reorder_level,
    unitCostCents: i.unit_cost_cents,
    supplier: i.supplier,
    low: i.stock_qty <= i.reorder_level,
  }));
}

export function listStockMovements(restaurantId: number, limit = 40, ingredientId?: number): InventoryMovement[] {
  return all<{
    id: number;
    delta: number;
    unit: string;
    reason: string;
    created_at: string;
    name: string;
    actor_name: string | null;
    order_number: number | null;
  }>(
    `SELECT sm.id, sm.delta, i.unit, sm.reason, sm.created_at, i.name, u.name AS actor_name, o.number AS order_number
     FROM stock_movements sm
     JOIN ingredients i ON i.id = sm.ingredient_id
     LEFT JOIN users u ON u.id = sm.actor_id
     LEFT JOIN orders o ON o.id = sm.order_id
     WHERE sm.restaurant_id = ? ${ingredientId ? "AND sm.ingredient_id = ?" : ""}
     ORDER BY sm.id DESC LIMIT ?`,
    ...(ingredientId ? [restaurantId, ingredientId, limit] : [restaurantId, limit]),
  ).map((m) => ({
    id: m.id,
    ingredientName: m.name,
    delta: m.delta,
    unit: m.unit,
    reason: m.reason,
    actorName: m.actor_name,
    createdAt: m.created_at,
    orderNumber: m.order_number,
  }));
}

export function adjustStock(input: {
  restaurantId: number;
  actor: SessionUser;
  ingredientId: number;
  delta: number;
  reason: string;
}): { newStock: number } {
  if (!["manager", "chef"].includes(input.actor.role)) throw forbidden("Ajustes de stock exigem autorização de gestão ou cozinha.");
  if (!Number.isFinite(input.delta) || input.delta === 0) throw badRequest("Movimento inválido.");
  if (!input.reason.trim()) throw badRequest("Indique o motivo do movimento.");

  return transaction(() => {
    const ingredient = get<{ id: number; name: string; stock_qty: number; unit: string }>(
      "SELECT id,name,stock_qty,unit FROM ingredients WHERE id=? AND restaurant_id=?",
      input.ingredientId,
      input.restaurantId,
    );
    if (!ingredient) throw notFound("Ingrediente não encontrado");
    const newStock = ingredient.stock_qty + input.delta;
    if (newStock < 0) throw badRequest(`Stock insuficiente: existem ${ingredient.stock_qty} ${ingredient.unit}.`);
    run("UPDATE ingredients SET stock_qty=? WHERE id=?", newStock, ingredient.id);
    run(
      "INSERT INTO stock_movements (restaurant_id,ingredient_id,delta,reason,actor_id,created_at) VALUES (?,?,?,?,?,?)",
      input.restaurantId,
      ingredient.id,
      input.delta,
      input.reason.slice(0, 200),
      input.actor.id,
      nowIso(),
    );
    recordAudit(
      input.actor,
      "stock.adjust",
      "ingredient",
      ingredient.id,
      `${ingredient.name}: ${input.delta > 0 ? "+" : ""}${input.delta} ${ingredient.unit} — ${input.reason}`,
    );
    return { newStock };
  });
}

export function updateIngredientMeta(input: {
  restaurantId: number;
  actor: SessionUser;
  ingredientId: number;
  reorderLevel?: number;
  unitCostCents?: number;
  supplier?: string;
}): void {
  if (input.actor.role !== "manager") throw forbidden();
  const ingredient = get<{ id: number; reorder_level: number; unit_cost_cents: number; supplier: string; name: string }>(
    "SELECT id,reorder_level,unit_cost_cents,supplier,name FROM ingredients WHERE id=? AND restaurant_id=?",
    input.ingredientId,
    input.restaurantId,
  );
  if (!ingredient) throw notFound("Ingrediente não encontrado");
  if (input.reorderLevel != null && (input.reorderLevel < 0 || input.reorderLevel > 100_000)) throw badRequest("Nível de reposição inválido.");
  if (input.unitCostCents != null && (input.unitCostCents < 0 || input.unitCostCents > 1_000_000)) throw badRequest("Custo inválido.");
  run(
    "UPDATE ingredients SET reorder_level=?, unit_cost_cents=?, supplier=? WHERE id=?",
    input.reorderLevel ?? ingredient.reorder_level,
    input.unitCostCents ?? ingredient.unit_cost_cents,
    (input.supplier ?? ingredient.supplier).slice(0, 120),
    ingredient.id,
  );
  recordAudit(input.actor, "ingredient.update", "ingredient", ingredient.id, `Dados de "${ingredient.name}" atualizados`);
}

export function createIngredient(input: {
  restaurantId: number;
  actor: SessionUser;
  name: string;
  unit: string;
  initialStock: number;
  reorderLevel: number;
  unitCostCents: number;
  supplier: string;
}): { ingredientId: number } {
  if (input.actor.role !== "manager") throw forbidden();
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("Nome inválido.");
  if (!["kg", "g", "L", "cl", "un"].includes(input.unit)) throw badRequest("Unidade inválida.");
  if (get("SELECT id FROM ingredients WHERE restaurant_id=? AND name=?", input.restaurantId, name)) {
    throw badRequest("Já existe um ingrediente com esse nome.");
  }
  return transaction(() => {
    const res = run(
      `INSERT INTO ingredients (restaurant_id,name,unit,stock_qty,reorder_level,unit_cost_cents,supplier,created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      input.restaurantId,
      name,
      input.unit,
      Math.max(0, input.initialStock),
      Math.max(0, input.reorderLevel),
      Math.max(0, Math.trunc(input.unitCostCents)),
      input.supplier.slice(0, 120),
      nowIso(),
    );
    const ingredientId = Number(res.lastInsertRowid);
    if (input.initialStock > 0) {
      run(
        "INSERT INTO stock_movements (restaurant_id,ingredient_id,delta,reason,actor_id,created_at) VALUES (?,?,?,?,?,?)",
        input.restaurantId,
        ingredientId,
        input.initialStock,
        "Contagem inicial",
        input.actor.id,
        nowIso(),
      );
    }
    recordAudit(input.actor, "ingredient.create", "ingredient", ingredientId, `Ingrediente "${name}" criado`);
    return { ingredientId };
  });
}

export function lowStockAlerts(restaurantId: number): Ingredient[] {
  return listIngredients(restaurantId).filter((i) => i.low);
}

export function ingredientUsage(restaurantId: number, ingredientId: number) {
  return all<{ product_name: string; qty: number; unit: string }>(
    `SELECT p.name AS product_name, pi.qty, i.unit
     FROM product_ingredients pi
     JOIN products p ON p.id = pi.product_id
     JOIN ingredients i ON i.id = pi.ingredient_id
     WHERE i.restaurant_id=? AND i.id=?
     ORDER BY p.name`,
    restaurantId,
    ingredientId,
  );
}
