import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maison.example";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/menu", "/reservas", "/salon", "/experiencias", "/historia", "/contactos"];
  return routes.map((route) => ({
    url: `${BASE}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" || route === "/menu" ? "weekly" : "monthly",
    priority: route === "" ? 1 : route === "/reservas" ? 0.9 : 0.7,
  }));
}
