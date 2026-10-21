import "server-only";
import { cache } from "react";
import { get } from "./db";
import { bool } from "./db";
import type { RestaurantConfig } from "./types";

export const getRestaurant = cache((restaurantId?: number): RestaurantConfig => {
  const row = restaurantId
    ? get<Record<string, unknown>>("SELECT * FROM restaurants WHERE id = ?", restaurantId)
    : get<Record<string, unknown>>("SELECT * FROM restaurants ORDER BY id LIMIT 1");
  if (!row) throw new Error("Restaurante não configurado");
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    tagline: String(row.tagline),
    currency: String(row.currency),
    taxRateBps: Number(row.tax_rate_bps),
    pricesIncludeTax: bool(row.prices_include_tax),
    serviceChargeBps: Number(row.service_charge_bps),
    timezone: String(row.timezone),
    address: String(row.address),
    phone: String(row.phone),
    email: String(row.email),
    lunchHours: String(row.lunch_hours),
    dinnerHours: String(row.dinner_hours),
  };
});

