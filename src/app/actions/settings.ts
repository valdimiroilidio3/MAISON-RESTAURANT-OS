"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { updateRestaurantSettings } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";
import type { ActionState } from "@/lib/action-types";
import { errorState } from "@/lib/action-errors";

export async function updateSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRole("manager");
    const taxPercent = Number(String(formData.get("taxRate") ?? "23").replace(",", "."));
    const servicePercent = Number(String(formData.get("serviceCharge") ?? "0").replace(",", "."));
    if (!Number.isFinite(taxPercent) || !Number.isFinite(servicePercent)) {
      return { ok: false, message: "Taxas inválidas." };
    }
    const parsed = settingsSchema.parse({
      tagline: formData.get("tagline") ?? "",
      address: formData.get("address") ?? "",
      phone: formData.get("phone") ?? "",
      email: formData.get("email") ?? "",
      lunchHours: formData.get("lunchHours") ?? "",
      dinnerHours: formData.get("dinnerHours") ?? "",
      taxRateBps: Math.round(taxPercent * 100),
      pricesIncludeTax: formData.get("pricesIncludeTax") === "on",
      serviceChargeBps: Math.round(servicePercent * 100),
    });
    updateRestaurantSettings({ actor: user, ...parsed });
    revalidatePath("/admin/configuracoes");
    revalidatePath("/admin/relatorios");
    revalidatePath("/");
    revalidatePath("/contactos");
    return { ok: true, message: "Configuração atualizada." };
  } catch (error) {
    return errorState(error);
  }
}
