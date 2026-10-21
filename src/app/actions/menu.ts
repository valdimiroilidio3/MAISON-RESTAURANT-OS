"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createCategory, createProduct, setProductAvailability, updateProduct } from "@/lib/menu";
import { createProductSchemaCompat, menuPriceToCents } from "@/lib/menu-form";
import type { ActionState } from "@/lib/action-types";
import { errorState } from "@/lib/action-errors";
import { productSchema, categorySchema } from "@/lib/validation";
import { z } from "zod";

function readAllergens(formData: FormData): string[] {
  const raw = String(formData.get("allergens") ?? "");
  return raw
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function createProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager");
    const priceCents = menuPriceToCents(String(formData.get("price") ?? ""));
    const parsed = productSchema.parse({
      name: formData.get("name"),
      categoryId: formData.get("categoryId"),
      description: formData.get("description") ?? "",
      priceCents,
      allergens: readAllergens(formData),
      prepMinutes: formData.get("prepMinutes") ?? 12,
      course: formData.get("course") ?? "main",
      available: formData.get("available") === "on",
      featured: formData.get("featured") === "on",
      imageUrl: formData.get("imageUrl") ?? "",
    });
    const result = createProduct({
      restaurantId: user.restaurantId,
      actor: user,
      name: parsed.name,
      categoryId: parsed.categoryId,
      description: parsed.description,
      priceCents: parsed.priceCents,
      allergens: parsed.allergens,
      prepMinutes: parsed.prepMinutes,
      course: parsed.course,
      imageUrl: parsed.imageUrl || null,
      featured: parsed.featured,
      available: parsed.available,
    });
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    revalidatePath("/");
    return { ok: true, message: "Produto criado.", data: { productId: result.productId } };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager");
    const productId = z.coerce.number().int().positive().parse(formData.get("productId"));
    const priceRaw = formData.get("price");
    const patch: Parameters<typeof updateProduct>[0]["patch"] = {
      name: String(formData.get("name") ?? ""),
      categoryId: Number(formData.get("categoryId") ?? 0),
      description: String(formData.get("description") ?? ""),
      allergens: readAllergens(formData),
      prepMinutes: Number(formData.get("prepMinutes") ?? 12),
      course: createProductSchemaCompat.course.parse(formData.get("course") ?? "main"),
      available: formData.get("available") === "on",
      featured: formData.get("featured") === "on",
    };
    if (priceRaw != null && String(priceRaw).trim() !== "") patch.priceCents = menuPriceToCents(String(priceRaw));
    updateProduct({ restaurantId: user.restaurantId, actor: user, productId, patch });
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    revalidatePath("/");
    return { ok: true, message: "Produto atualizado." };
  } catch (error) {
    return errorState(error);
  }
}

export async function toggleProductAvailabilityAction(formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager");
    const productId = z.coerce.number().int().positive().parse(formData.get("productId"));
    const available = String(formData.get("available")) === "1";
    setProductAvailability({ restaurantId: user.restaurantId, actor: user, productId, available });
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    return { ok: true, message: available ? "Produto disponível." : "Produto marcado como esgotado." };
  } catch (error) {
    return errorState(error);
  }
}

export async function createCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager");
    const parsed = categorySchema.parse({
      name: formData.get("name"),
      description: formData.get("description") ?? "",
    });
    createCategory({ restaurantId: user.restaurantId, actor: user, name: parsed.name, description: parsed.description });
    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    return { ok: true, message: "Categoria criada." };
  } catch (error) {
    return errorState(error);
  }
}
