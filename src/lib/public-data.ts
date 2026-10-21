import "server-only";
import { all } from "./db";
import { getRestaurant } from "./restaurant";
import type { PublicFloor } from "./public-types";

export function getPublicRestaurant() {
  return getRestaurant();
}

/** Layout-only floor data for the public 3D preview — never exposes table status. */
export function getPublicFloor(): PublicFloor {
  const restaurant = getRestaurant();
  const zones = all<{ id: number; name: string; slug: string }>(
    "SELECT id, name, slug FROM zones WHERE restaurant_id = ? ORDER BY sort_order, id",
    restaurant.id,
  ).map((zone) => ({ id: Number(zone.id), name: String(zone.name), slug: String(zone.slug) }));
  const tables = all<{
    id: number;
    code: string;
    seats: number;
    shape: "round" | "rect";
    pos_x: number;
    pos_z: number;
    rotation: number;
    zone_slug: string;
    zone_name: string;
  }>(
    `SELECT t.id,t.code,t.seats,t.shape,t.pos_x,t.pos_z,t.rotation,z.slug AS zone_slug,z.name AS zone_name
     FROM tables t JOIN zones z ON z.id = t.zone_id
     WHERE t.restaurant_id = ? ORDER BY t.code`,
    restaurant.id,
  );

  return {
    tables: tables.map((t) => ({
      id: t.id,
      code: t.code,
      seats: t.seats,
      shape: t.shape,
      x: t.pos_x,
      z: t.pos_z,
      rotation: t.rotation,
      zoneSlug: t.zone_slug,
      zoneName: t.zone_name,
    })),
    zones,
    restaurant: {
      name: restaurant.name,
      tagline: restaurant.tagline,
      address: restaurant.address,
      phone: restaurant.phone,
      email: restaurant.email,
      lunchHours: restaurant.lunchHours,
      dinnerHours: restaurant.dinnerHours,
    },
    capacity: tables.reduce((sum, t) => sum + t.seats, 0),
  };
}
