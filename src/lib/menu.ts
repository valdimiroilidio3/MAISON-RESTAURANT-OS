import "server-only";
import { all, get, run, transaction, bool } from "./db";
import { getRestaurant } from "./restaurant";
import { recordAudit } from "./audit";
import { nowIso } from "./dates";
import { badRequest, conflict, notFound } from "./api";
import type { MenuCatalog, MenuCategory, MenuProduct, SessionUser } from "./types";

function parseList(json: string): string[] {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export function getMenuCatalog(restaurantId: number): MenuCatalog {
  const categories = all<{
    id: number;
    name: string;
    slug: string;
    description: string;
    sort_order: number;
  }>("SELECT id,name,slug,description,sort_order FROM categories WHERE restaurant_id=? ORDER BY sort_order,id", restaurantId).map(
    (c): MenuCategory => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      sortOrder: c.sort_order,
    }),
  );

  const recipes = all<{ product_id: number; ingredient_id: number; name: string; unit: string; qty: number }>(
    `SELECT pi.product_id, pi.ingredient_id, i.name, i.unit, pi.qty
     FROM product_ingredients pi JOIN ingredients i ON i.id = pi.ingredient_id
     WHERE i.restaurant_id = ?`,
    restaurantId,
  );
  const recipeByProduct = new Map<number, { ingredientId: number; name: string; unit: string; qty: number }[]>();
  for (const r of recipes) {
    const list = recipeByProduct.get(r.product_id) ?? [];
    list.push({ ingredientId: r.ingredient_id, name: r.name, unit: r.unit, qty: r.qty });
    recipeByProduct.set(r.product_id, list);
  }

  const products = all<{
    id: number;
    category_id: number;
    category_name: string;
    category_slug: string;
    name: string;
    description: string;
    price_cents: number;
    available: number;
    allergens: string;
    prep_minutes: number;
    course: string;
    image_url: string | null;
    featured: number;
    sort_order: number;
  }>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.restaurant_id = ? ORDER BY c.sort_order, p.sort_order, p.id`,
    restaurantId,
  ).map(
    (p): MenuProduct => ({
      id: p.id,
      categoryId: p.category_id,
      categoryName: p.category_name,
      categorySlug: p.category_slug,
      name: p.name,
      description: p.description,
      priceCents: p.price_cents,
      available: bool(p.available),
      allergens: parseList(p.allergens),
      prepMinutes: p.prep_minutes,
      course: p.course,
      imageUrl: p.image_url,
      featured: bool(p.featured),
      sortOrder: p.sort_order,
      recipe: recipeByProduct.get(p.id) ?? [],
    }),
  );

  const modifiers = all<{ id: number; name: string; price_delta_cents: number; group_name: string }>(
    "SELECT id,name,price_delta_cents,group_name FROM modifiers WHERE restaurant_id=? AND active=1 ORDER BY sort_order,id",
    restaurantId,
  ).map((m) => ({ id: m.id, name: m.name, priceDeltaCents: m.price_delta_cents, groupName: m.group_name }));

  return { categories, products, modifiers };
}

export function getPublicMenu(): { restaurant: ReturnType<typeof getRestaurant>; catalog: MenuCatalog } {
  const restaurant = getRestaurant();
  return { restaurant, catalog: getMenuCatalog(restaurant.id) };
}

export function getProduct(restaurantId: number, productId: number) {
  const product = get<{
    id: number;
    category_id: number;
    name: string;
    description: string;
    price_cents: number;
    available: number;
    allergens: string;
    prep_minutes: number;
    course: string;
    image_url: string | null;
    featured: number;
    sort_order: number;
  }>("SELECT * FROM products WHERE id=? AND restaurant_id=?", productId, restaurantId);
  if (!product) throw notFound("Produto não encontrado");
  return product;
}

function assertMenuManager(actor: SessionUser) {
  if (actor.role !== "manager") throw badRequest("Apenas a gestão pode editar o menu.");
}

export function createProduct(input: {
  restaurantId: number;
  actor: SessionUser;
  name: string;
  categoryId: number;
  description: string;
  priceCents: number;
  allergens: string[];
  prepMinutes: number;
  course: string;
  imageUrl?: string | null;
  featured?: boolean;
  available?: boolean;
}): { productId: number } {
  assertMenuManager(input.actor);
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("Nome do produto demasiado curto.");
  if (input.priceCents < 0 || input.priceCents > 100_000) throw badRequest("Preço inválido.");
  const category = get<{ id: number }>("SELECT id FROM categories WHERE id=? AND restaurant_id=?", input.categoryId, input.restaurantId);
  if (!category) throw notFound("Categoria não encontrada");

  return transaction(() => {
    const max = get<{ n: number | null }>(
      "SELECT MAX(sort_order) AS n FROM products WHERE restaurant_id=? AND category_id=?",
      input.restaurantId,
      input.categoryId,
    );
    const res = run(
      `INSERT INTO products (restaurant_id,category_id,name,description,price_cents,available,allergens,prep_minutes,course,image_url,featured,sort_order,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      input.restaurantId,
      input.categoryId,
      name,
      input.description.slice(0, 500),
      Math.trunc(input.priceCents),
      input.available === false ? 0 : 1,
      JSON.stringify(input.allergens.slice(0, 12)),
      Math.min(120, Math.max(1, Math.trunc(input.prepMinutes))),
      input.course,
      input.imageUrl ?? null,
      input.featured ? 1 : 0,
      Number(max?.n ?? 0) + 1,
      nowIso(),
      nowIso(),
    );
    const productId = Number(res.lastInsertRowid);
    recordAudit(input.actor, "product.create", "product", productId, `Produto "${name}" criado`);
    return { productId };
  });
}

export function updateProduct(input: {
  restaurantId: number;
  actor: SessionUser;
  productId: number;
  patch: {
    name?: string;
    categoryId?: number;
    description?: string;
    priceCents?: number;
    allergens?: string[];
    prepMinutes?: number;
    course?: string;
    available?: boolean;
    featured?: boolean;
    imageUrl?: string | null;
  };
}): void {
  assertMenuManager(input.actor);
  transaction(() => {
    const product = getProduct(input.restaurantId, input.productId);
    const p = input.patch;
    if (p.priceCents != null && (p.priceCents < 0 || p.priceCents > 100_000)) throw badRequest("Preço inválido.");
    if (p.categoryId != null) {
      const category = get<{ id: number }>("SELECT id FROM categories WHERE id=? AND restaurant_id=?", p.categoryId, input.restaurantId);
      if (!category) throw notFound("Categoria não encontrada");
    }
    run(
      `UPDATE products SET name=?,category_id=?,description=?,price_cents=?,allergens=?,prep_minutes=?,course=?,available=?,featured=?,image_url=?,updated_at=?
       WHERE id=? AND restaurant_id=?`,
      (p.name ?? product.name).trim().slice(0, 120),
      p.categoryId ?? product.category_id,
      (p.description ?? product.description).slice(0, 500),
      p.priceCents != null ? Math.trunc(p.priceCents) : product.price_cents,
      JSON.stringify((p.allergens ?? parseList(product.allergens)).slice(0, 12)),
      p.prepMinutes != null ? Math.min(120, Math.max(1, Math.trunc(p.prepMinutes))) : product.prep_minutes,
      p.course ?? product.course,
      p.available != null ? (p.available ? 1 : 0) : product.available,
      p.featured != null ? (p.featured ? 1 : 0) : product.featured,
      p.imageUrl !== undefined ? p.imageUrl : product.image_url,
      nowIso(),
      input.productId,
      input.restaurantId,
    );
    const priceChanged = p.priceCents != null && p.priceCents !== product.price_cents;
    recordAudit(
      input.actor,
      "product.update",
      "product",
      input.productId,
      `Produto "${p.name ?? product.name}" atualizado${priceChanged ? ` — novo preço ${(Number(p.priceCents) / 100).toFixed(2)} €` : ""}`,
    );
  });
}

export function setProductAvailability(input: {
  restaurantId: number;
  actor: SessionUser;
  productId: number;
  available: boolean;
}): void {
  assertMenuManager(input.actor);
  const product = getProduct(input.restaurantId, input.productId);
  run("UPDATE products SET available=?, updated_at=? WHERE id=?", input.available ? 1 : 0, nowIso(), product.id);
  recordAudit(
    input.actor,
    "product.availability",
    "product",
    product.id,
    `"${product.name}" → ${input.available ? "disponível" : "esgotado"}`,
  );
}

export function createCategory(input: {
  restaurantId: number;
  actor: SessionUser;
  name: string;
  description: string;
}): { categoryId: number } {
  assertMenuManager(input.actor);
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("Nome da categoria inválido.");
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (get("SELECT id FROM categories WHERE restaurant_id=? AND slug=?", input.restaurantId, slug)) {
    throw conflict("Já existe uma categoria com esse nome.");
  }
  const max = get<{ n: number | null }>("SELECT MAX(sort_order) AS n FROM categories WHERE restaurant_id=?", input.restaurantId);
  const res = run(
    "INSERT INTO categories (restaurant_id,name,slug,description,sort_order) VALUES (?,?,?,?,?)",
    input.restaurantId,
    name,
    slug,
    input.description.slice(0, 200),
    Number(max?.n ?? 0) + 1,
  );
  const categoryId = Number(res.lastInsertRowid);
  recordAudit(input.actor, "category.create", "category", categoryId, `Categoria "${name}" criada`);
  return { categoryId };
}

export function setProductRecipe(input: {
  restaurantId: number;
  actor: SessionUser;
  productId: number;
  lines: { ingredientId: number; qty: number }[];
}): void {
  if (!["manager", "chef"].includes(input.actor.role)) throw badRequest("Sem permissão para editar receitas.");
  const product = getProduct(input.restaurantId, input.productId);
  transaction(() => {
    run("DELETE FROM product_ingredients WHERE product_id=?", product.id);
    for (const line of input.lines.slice(0, 40)) {
      if (!Number.isFinite(line.qty) || line.qty <= 0) throw badRequest("Quantidade de receita inválida.");
      const ingredient = get<{ id: number }>(
        "SELECT id FROM ingredients WHERE id=? AND restaurant_id=?",
        line.ingredientId,
        input.restaurantId,
      );
      if (!ingredient) throw notFound("Ingrediente não encontrado");
      run("INSERT INTO product_ingredients (product_id,ingredient_id,qty) VALUES (?,?,?)", product.id, line.ingredientId, line.qty);
    }
    recordAudit(
      input.actor,
      "product.recipe",
      "product",
      product.id,
      `Receita de "${product.name}" atualizada (${input.lines.length} ingredientes)`,
    );
  });
}
