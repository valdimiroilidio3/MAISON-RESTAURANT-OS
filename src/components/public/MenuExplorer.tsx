"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { eur } from "@/lib/money";
import type { MenuCatalog } from "@/lib/types";

const ALLERGENS = [
  "Glúten",
  "Leite",
  "Ovo",
  "Peixe",
  "Moluscos",
  "Crustáceos",
  "Frutos de casca rija",
  "Soja",
  "Mostarda",
  "Sulfitos",
  "Sésamo",
  "Tremoço",
];

export function MenuExplorer({ catalog }: { catalog: MenuCatalog }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return catalog.products.filter((product) => {
      if (category !== "all" && product.categorySlug !== category) return false;
      if (excluded.some((allergen) => product.allergens.includes(allergen))) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        product.description.toLowerCase().includes(term) ||
        product.allergens.some((allergen) => allergen.toLowerCase().includes(term))
      );
    });
  }, [catalog.products, category, excluded, query]);

  const groups = catalog.categories
    .map((cat) => ({ category: cat, products: filtered.filter((product) => product.categoryId === cat.id) }))
    .filter((group) => group.products.length > 0);

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-5 border-y border-line bg-ink/90 px-5 py-3 backdrop-blur-xl md:-mx-10 md:px-10">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Procurar prato, ingrediente ou alergénio..."
              className="field h-9 pl-8 text-xs"
              aria-label="Procurar no menu"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((value) => !value)}
            aria-expanded={filtersOpen}
            className={cn("btn btn-ghost btn-sm", (excluded.length > 0 || filtersOpen) && "border-gold/50 text-gold-soft")}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Filtros{excluded.length > 0 ? ` · ${excluded.length}` : ""}
          </button>
          <div className="scroll-x flex max-w-full gap-1.5">
            <button
              type="button"
              aria-pressed={category === "all"}
              onClick={() => setCategory("all")}
              className={cn("chip transition", category === "all" ? "border-gold/60 bg-gold/10 text-gold-soft" : "hover:text-cream")}
            >
              Tudo
            </button>
            {catalog.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                aria-pressed={category === cat.slug}
                onClick={() => setCategory(cat.slug)}
                className={cn("chip transition", category === cat.slug ? "border-gold/60 bg-gold/10 text-gold-soft" : "hover:text-cream")}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] uppercase tracking-[0.14em] text-muted">Excluir alergénios:</span>
              {ALLERGENS.map((allergen) => {
                const active = excluded.includes(allergen);
                return (
                  <button
                    key={allergen}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setExcluded((list) => (active ? list.filter((item) => item !== allergen) : [...list, allergen]))}
                    className={cn("chip transition", active ? "border-alert/50 bg-alert/10 text-alert" : "hover:text-cream")}
                  >
                    {allergen}
                  </button>
                );
              })}
              {excluded.length > 0 && (
                <button type="button" onClick={() => setExcluded([])} className="chip text-muted hover:text-cream">
                  <X className="size-3" aria-hidden /> limpar
                </button>
              )}
            </div>
            <p className="mt-2 text-[10px] text-muted">
              Informação indicativa. Para alergias severas, avise a equipa no momento da reserva — a cozinha tem
              contaminação cruzada possível.
            </p>
          </div>
        )}
      </div>

      <div className="mt-10 space-y-14">
        {groups.length === 0 && (
          <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
            <p className="font-display text-xl text-cream">Sem pratos para estes filtros</p>
            <p className="mt-2 text-sm text-muted">Experimente remover um alergénio ou procurar outra palavra.</p>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-5"
              onClick={() => {
                setQuery("");
                setCategory("all");
                setExcluded([]);
              }}
            >
              Limpar filtros
            </button>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.category.id} id={group.category.slug} aria-labelledby={`cat-${group.category.slug}`}>
            <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
              <div>
                <h2 id={`cat-${group.category.slug}`} className="font-display text-2xl text-cream">
                  {group.category.name}
                </h2>
                <p className="mt-1 text-[11px] text-muted">{group.category.description}</p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted">{group.products.length} itens</span>
            </div>

            <ul className="mt-4 divide-y divide-line/60">
              {group.products.map((product) => (
                <li key={product.id} className="group grid gap-2 py-5 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className={cn("font-display text-lg", product.available ? "text-cream" : "text-muted line-through")}>
                        {product.name}
                      </h3>
                      {product.featured && product.available && (
                        <span className="text-[9px] uppercase tracking-[0.16em] text-gold">destaque</span>
                      )}
                      {!product.available && (
                        <span className="chip border-line-strong text-[9px] text-muted">esgotado hoje</span>
                      )}
                    </div>
                    <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">{product.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {product.allergens.map((allergen) => (
                        <span key={allergen} className="chip border-line/80 py-0 text-[9px] text-cream-dim/70">
                          {allergen}
                        </span>
                      ))}
                      {product.allergens.length === 0 && (
                        <span className="text-[9px] uppercase tracking-[0.14em] text-muted">sem alergénios declarados</span>
                      )}
                      <span className="text-[9px] text-muted">· {product.prepMinutes} min</span>
                    </div>
                  </div>
                  <div className="flex items-start justify-end sm:min-w-[90px]">
                    <span className="font-display text-lg text-cream tnum">{eur(product.priceCents)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-16 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4">
        <p className="text-xs text-cream-dim">Gostava de reservar uma mesa para provar o menu?</p>
        <Link href="/reservas" className="btn btn-primary btn-sm">
          Reservar mesa
        </Link>
      </div>
    </div>
  );
}
