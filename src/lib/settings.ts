import "server-only";
import { all, get, run, transaction } from "./db";
import { nowIso } from "./dates";
import { recordAudit } from "./audit";
import { getRestaurant } from "./restaurant";
import { badRequest, forbidden } from "./api";
import type { SessionUser } from "./types";

export function updateRestaurantSettings(input: {
  actor: SessionUser;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  lunchHours: string;
  dinnerHours: string;
  taxRateBps: number;
  pricesIncludeTax: boolean;
  serviceChargeBps: number;
}): void {
  if (input.actor.role !== "manager") throw forbidden("Apenas a gestão pode alterar a configuração fiscal.");
  if (input.taxRateBps < 0 || input.taxRateBps > 3000) throw badRequest("Taxa de IVA fora do intervalo (0–30%).");
  if (input.serviceChargeBps < 0 || input.serviceChargeBps > 2000) throw badRequest("Taxa de serviço fora do intervalo (0–20%).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email)) throw badRequest("Email do restaurante inválido.");

  const restaurant = getRestaurant(input.actor.restaurantId);
  const previous = get<{ tax_rate_bps: number; service_charge_bps: number }>(
    "SELECT tax_rate_bps, service_charge_bps FROM restaurants WHERE id = ?",
    restaurant.id,
  );

  transaction(() => {
    run(
      `UPDATE restaurants SET tagline=?, address=?, phone=?, email=?, lunch_hours=?, dinner_hours=?,
        tax_rate_bps=?, prices_include_tax=?, service_charge_bps=? WHERE id=?`,
      input.tagline.slice(0, 200),
      input.address.slice(0, 240),
      input.phone.slice(0, 40),
      input.email.slice(0, 160),
      input.lunchHours.slice(0, 40),
      input.dinnerHours.slice(0, 40),
      Math.round(input.taxRateBps),
      input.pricesIncludeTax ? 1 : 0,
      Math.round(input.serviceChargeBps),
      restaurant.id,
    );
    recordAudit(
      input.actor,
      "settings.update",
      "restaurant",
      restaurant.id,
      `Configuração atualizada — IVA ${(previous?.tax_rate_bps ?? 0) / 100}% → ${input.taxRateBps / 100}%, serviço ${(previous?.service_charge_bps ?? 0) / 100}% → ${input.serviceChargeBps / 100}%`,
    );
    run(
      "INSERT INTO audit_log (restaurant_id,actor_id,action,entity,entity_id,detail,created_at) VALUES (?,?,?,?,?,?,?)",
      restaurant.id,
      input.actor.id,
      "settings.contact",
      "restaurant",
      String(restaurant.id),
      `Contactos: ${input.phone} · ${input.email}`,
      nowIso(),
    );
  });
}

export function staffOverview(restaurantId: number) {
  return all<{ id: number; name: string; email: string; role: string; active: number }>(
    "SELECT id, name, email, role, active FROM users WHERE restaurant_id = ? ORDER BY role, name",
    restaurantId,
  );
}
