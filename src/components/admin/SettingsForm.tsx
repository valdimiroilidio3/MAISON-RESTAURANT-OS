"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, ShieldAlert } from "lucide-react";
import { idleAction, type ActionState } from "@/lib/action-types";
import { updateSettingsAction } from "@/app/actions/settings";
import type { RestaurantConfig } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

export function SettingsForm({ restaurant }: { restaurant: RestaurantConfig }) {
  const toast = useToast();
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await updateSettingsAction(previous, formData);
      toast.push(result.message, result.ok ? "success" : "error");
      if (result.ok) router.refresh();
      return result;
    },
    idleAction,
  );

  useEffect(() => {}, [state]);

  return (
    <form action={action} className="space-y-4 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="tagline">
            Assinatura do restaurante
          </label>
          <input id="tagline" name="tagline" defaultValue={restaurant.tagline} className="field" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="address">
            Morada
          </label>
          <input id="address" name="address" defaultValue={restaurant.address} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Telefone
          </label>
          <input id="phone" name="phone" defaultValue={restaurant.phone} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email de reservas
          </label>
          <input id="email" name="email" type="email" defaultValue={restaurant.email} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="lunchHours">
            Serviço de almoço
          </label>
          <input id="lunchHours" name="lunchHours" defaultValue={restaurant.lunchHours} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="dinnerHours">
            Serviço de jantar
          </label>
          <input id="dinnerHours" name="dinnerHours" defaultValue={restaurant.dinnerHours} className="field" />
        </div>
      </div>

      <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="taxRate">
            IVA (%)
          </label>
          <input
            id="taxRate"
            name="taxRate"
            inputMode="decimal"
            defaultValue={(restaurant.taxRateBps / 100).toFixed(2).replace(".", ",")}
            className="field tnum"
          />
        </div>
        <div>
          <label className="label" htmlFor="serviceCharge">
            Serviço (%)
          </label>
          <input
            id="serviceCharge"
            name="serviceCharge"
            inputMode="decimal"
            defaultValue={(restaurant.serviceChargeBps / 100).toFixed(2).replace(".", ",")}
            className="field tnum"
          />
        </div>
        <label className="flex items-end gap-2 pb-1 text-xs text-cream-dim">
          <input type="checkbox" name="pricesIncludeTax" defaultChecked={restaurant.pricesIncludeTax} className="size-3.5 accent-[#C6A66B]" />
          Preços do menu incluem IVA
        </label>
      </div>

      <p className="flex items-start gap-2 rounded-md border border-amber/25 bg-amber/[0.07] px-3 py-2 text-[11px] text-amber">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Alterar o IVA recalcula apenas comandas criadas a partir deste momento. Comandas já fechadas mantêm os valores
        registados e não são reescritas.
      </p>

      {state.message && (
        <p className={state.ok ? "text-[11px] text-mint" : "text-[11px] text-alert"}>{state.message}</p>
      )}

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
          Guardar configuração
        </button>
      </div>
    </form>
  );
}
