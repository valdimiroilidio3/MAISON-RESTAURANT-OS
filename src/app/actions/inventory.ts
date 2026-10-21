"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { adjustStock, createIngredient, updateIngredientMeta } from "@/lib/inventory";
import { setProductRecipe } from "@/lib/menu";
import { ingredientSchema, ingredientMetaSchema, stockAdjustSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/action-types";
import { errorState } from "@/lib/action-errors";

function parseDecimal(raw: string): number {
  const value = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(value)) throw new Error("Valor numérico inválido.");
  return value;
}

export async function adjustStockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager", "chef");
    const parsed = stockAdjustSchema.parse({
      ingredientId: formData.get("ingredientId"),
      delta: parseDecimal(String(formData.get("delta") ?? "")),
      reason: formData.get("reason"),
    });
    const result = adjustStock({
      restaurantId: user.restaurantId,
      actor: user,
      ingredientId: parsed.ingredientId,
      delta: parsed.delta,
      reason: parsed.reason,
    });
    revalidatePath("/admin/inventario");
    revalidatePath("/admin");
    return { ok: true, message: `Stock atualizado: ${result.newStock} unidades disponíveis.` };
  } catch (error) {
    return errorState(error);
  }
}

export async function createIngredientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager");
    const parsed = ingredientSchema.parse({
      name: formData.get("name"),
      unit: formData.get("unit"),
      initialStock: formData.get("initialStock") ?? 0,
      reorderLevel: formData.get("reorderLevel") ?? 0,
      unitCostCents: formData.get("unitCost") ? Math.round(parseDecimal(String(formData.get("unitCost"))) * 100) : 0,
      supplier: formData.get("supplier") ?? "",
    });
    createIngredient({ restaurantId: user.restaurantId, actor: user, ...parsed });
    revalidatePath("/admin/inventario");
    return { ok: true, message: "Ingrediente criado." };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateIngredientMetaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager");
    const parsed = ingredientMetaSchema.parse({
      ingredientId: formData.get("ingredientId"),
      reorderLevel: formData.get("reorderLevel") ?? undefined,
      unitCostCents: formData.get("unitCost") ? Math.round(parseDecimal(String(formData.get("unitCost"))) * 100) : undefined,
      supplier: String(formData.get("supplier") ?? ""),
    });
    updateIngredientMeta({ restaurantId: user.restaurantId, actor: user, ...parsed });
    revalidatePath("/admin/inventario");
    return { ok: true, message: "Dados do ingrediente atualizados." };
  } catch (error) {
    return errorState(error);
  }
}

export async function saveRecipeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager", "chef");
    const productId = z.coerce.number().int().positive().parse(formData.get("productId"));
    const lines: { ingredientId: number; qty: number }[] = [];
    for (const [key, value] of formData.entries()) {
      const match = /^ingredient_(\d+)$/.exec(key);
      if (!match) continue;
      const raw = String(value).trim();
      if (!raw) continue;
      const qty = parseDecimal(raw);
      if (qty > 0) lines.push({ ingredientId: Number(match[1]), qty });
    }
    setProductRecipe({ restaurantId: user.restaurantId, actor: user, productId, lines });
    revalidatePath("/admin/inventario");
    revalidatePath("/admin/menu");
    return { ok: true, message: `Receita guardada (${lines.length} ingredientes).` };
  } catch (error) {
    return errorState(error);
  }
}
