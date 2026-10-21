"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, Pencil, Plus, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { eur } from "@/lib/money";
import { ALLERGEN_OPTIONS, COURSE_OPTIONS } from "@/lib/menu-form";
import { idleAction, type ActionState } from "@/lib/action-types";
import type { MenuCatalog, MenuProduct } from "@/lib/types";
import { createCategoryAction, createProductAction, toggleProductAvailabilityAction, updateProductAction } from "@/app/actions/menu";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";

function AvailabilityToggle({ product }: { product: MenuProduct }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async (formData) => {
        setPending(true);
        const result = await toggleProductAvailabilityAction(formData);
        setPending(false);
        toast.push(result.message, result.ok ? "success" : "error");
        if (result.ok) router.refresh();
      }}
    >
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="available" value={product.available ? "0" : "1"} />
      <button
        type="submit"
        disabled={pending}
        role="switch"
        aria-checked={product.available}
        aria-label={`Disponibilidade de ${product.name}`}
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full border transition",
          product.available ? "border-mint/50 bg-mint/25" : "border-line-strong bg-surface-3",
        )}
      >
        <span
          className={cn(
            "inline-block size-3.5 rounded-full bg-cream transition-transform",
            product.available ? "translate-x-[18px]" : "translate-x-[3px]",
          )}
        />
        {pending && <Loader2 className="absolute -right-5 size-3 animate-spin text-muted" aria-hidden />}
      </button>
    </form>
  );
}

function ProductForm({
  open,
  onClose,
  catalog,
  product,
}: {
  open: boolean;
  onClose: () => void;
  catalog: MenuCatalog;
  product: MenuProduct | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const isEdit = !!product;
  const [allergens, setAllergens] = useState<string[]>(product?.allergens ?? []);

  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = isEdit ? await updateProductAction(previous, formData) : await createProductAction(previous, formData);
      if (result.ok) {
        toast.push(result.message, "success");
        router.refresh();
        onClose();
      }
      return result;
    },
    idleAction,
  );

  useEffect(() => {
    setAllergens(product?.allergens ?? []);
  }, [product?.id, product?.allergens]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Editar ${product?.name}` : "Novo produto"}
      description="Os preços e a disponibilidade aqui definidos alimentam o website, o salão e o KDS."
      width="max-w-2xl"
    >
      <form action={action} className="space-y-3">
        {isEdit && <input type="hidden" name="productId" value={product.id} />}
        <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
          <div>
            <label className="label" htmlFor="product-name">
              Nome
            </label>
            <input id="product-name" name="name" required defaultValue={product?.name} className="field" />
            {state.fieldErrors?.name && <p className="mt-1 text-[10px] text-alert">{state.fieldErrors.name}</p>}
          </div>
          <div>
            <label className="label" htmlFor="product-category">
              Categoria
            </label>
            <select id="product-category" name="categoryId" defaultValue={product?.categoryId ?? catalog.categories[0]?.id} className="field">
              {catalog.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="product-description">
            Descrição
          </label>
          <textarea id="product-description" name="description" rows={2} defaultValue={product?.description} className="field resize-none" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="product-price">
              Preço (€)
            </label>
            <input
              id="product-price"
              name="price"
              required
              inputMode="decimal"
              defaultValue={product ? (product.priceCents / 100).toFixed(2).replace(".", ",") : ""}
              placeholder="12,50"
              className="field tnum"
            />
          </div>
          <div>
            <label className="label" htmlFor="product-prep">
              Prep. (min)
            </label>
            <input id="product-prep" name="prepMinutes" type="number" min={1} max={120} defaultValue={product?.prepMinutes ?? 12} className="field tnum" />
          </div>
          <div>
            <label className="label" htmlFor="product-course">
              Fase
            </label>
            <select id="product-course" name="course" defaultValue={product?.course ?? "main"} className="field">
              {COURSE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="label">Alergénios</span>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGEN_OPTIONS.map((allergen) => {
              const active = allergens.includes(allergen);
              return (
                <button
                  key={allergen}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setAllergens((list) => (active ? list.filter((item) => item !== allergen) : [...list, allergen]))
                  }
                  className={cn("chip transition", active ? "border-amber/50 bg-amber/10 text-amber" : "hover:text-cream")}
                >
                  {allergen}
                </button>
              );
            })}
          </div>
          <input type="hidden" name="allergens" value={allergens.join(",")} />
        </div>

        <div>
          <label className="label" htmlFor="product-image">
            Imagem (URL)
          </label>
          <input id="product-image" name="imageUrl" defaultValue={product?.imageUrl ?? ""} placeholder="/images/dish-crudo.jpg" className="field" />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-cream-dim">
            <input type="checkbox" name="available" defaultChecked={product?.available ?? true} className="size-3.5 accent-[#C6A66B]" />
            Disponível
          </label>
          <label className="flex items-center gap-2 text-xs text-cream-dim">
            <input type="checkbox" name="featured" defaultChecked={product?.featured ?? false} className="size-3.5 accent-[#C6A66B]" />
            Destacado no website
          </label>
        </div>

        {state.message && !state.ok && (
          <p role="alert" className="rounded-md border border-alert/30 bg-alert/10 px-3 py-2 text-xs text-alert">
            {state.message}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {isEdit ? "Guardar alterações" : "Criar produto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CategoryForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await createCategoryAction(previous, formData);
      if (result.ok) {
        toast.push(result.message, "success");
        router.refresh();
        onClose();
      }
      return result;
    },
    idleAction,
  );

  return (
    <Modal open={open} onClose={onClose} title="Nova categoria" width="max-w-md">
      <form action={action} className="space-y-3">
        <div>
          <label className="label" htmlFor="category-name">
            Nome
          </label>
          <input id="category-name" name="name" required className="field" placeholder="Petiscos, Vinhos..." />
        </div>
        <div>
          <label className="label" htmlFor="category-description">
            Descrição
          </label>
          <input id="category-description" name="description" className="field" placeholder="Uma linha que aparece no menu" />
        </div>
        {state.message && !state.ok && <p className="text-xs text-alert">{state.message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Criar categoria
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function MenuManager({ catalog }: { catalog: MenuCatalog }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [editing, setEditing] = useState<MenuProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return catalog.products.filter((product) => {
      if (category !== "all" && product.categorySlug !== category) return false;
      if (!term) return true;
      return product.name.toLowerCase().includes(term) || product.description.toLowerCase().includes(term);
    });
  }, [catalog.products, category, query]);

  const grouped = useMemo(() => {
    return catalog.categories
      .map((cat) => ({ category: cat, products: filtered.filter((product) => product.categoryId === cat.id) }))
      .filter((group) => group.products.length > 0);
  }, [catalog.categories, filtered]);

  const unavailable = catalog.products.filter((p) => !p.available).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Procurar produto..."
              className="field w-56 pl-8"
              aria-label="Procurar produto"
            />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="field w-auto" aria-label="Filtrar por categoria">
            <option value="all">Todas as categorias</option>
            {catalog.categories.map((cat) => (
              <option key={cat.id} value={cat.slug}>
                {cat.name}
              </option>
            ))}
          </select>
          <span className="chip tnum">{catalog.products.length} produtos</span>
          {unavailable > 0 && <span className="chip border-amber/40 text-amber tnum">{unavailable} esgotados</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCategoryOpen(true)}>
            <Plus className="size-3.5" aria-hidden /> Categoria
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" aria-hidden /> Novo produto
          </button>
        </div>
      </div>

      <p className="flex items-center gap-1.5 rounded-lg border border-gold/20 bg-gold/[0.05] px-3 py-2 text-[11px] text-gold-soft">
        <Sparkles className="size-3" aria-hidden />
        Fonte única: estes produtos e preços são os mesmos usados no website público, no salão e nas comandas.
      </p>

      {grouped.length === 0 ? (
        <EmptyState icon={Search} title="Sem produtos" description="Ajuste a pesquisa ou crie um novo produto." />
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <section key={group.category.id} className="panel overflow-hidden">
              <header className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <h2 className="text-sm text-cream">{group.category.name}</h2>
                  <p className="text-[11px] text-muted">{group.category.description || "—"}</p>
                </div>
                <span className="text-[10px] text-muted tnum">{group.products.length} itens</span>
              </header>
              <ul className="divide-y divide-line/70">
                {group.products.map((product) => (
                  <li key={product.id} className="table-row-hover flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-line bg-surface-3">
                      {product.imageUrl ? (
                        <Image src={product.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-muted">
                          <ImageIcon className="size-4" aria-hidden />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("text-xs text-cream", !product.available && "text-muted line-through")}>{product.name}</p>
                        {product.featured && <span className="chip border-gold/40 text-gold-soft">destaque</span>}
                        {product.allergens.length > 0 && (
                          <span className="text-[10px] text-amber">{product.allergens.join(" · ")}</span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-muted">{product.description}</p>
                      <p className="mt-0.5 text-[10px] text-muted tnum">
                        {product.prepMinutes} min · {product.recipe.length} ingredientes na receita
                      </p>
                    </div>
                    <span className="text-sm text-cream tnum">{eur(product.priceCents)}</span>
                    <div className="flex items-center gap-3">
                      <AvailabilityToggle product={product} />
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(product)}>
                        <Pencil className="size-3" aria-hidden /> Editar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ProductForm
        key={editing?.id ?? (creating ? "new" : "closed")}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        catalog={catalog}
        product={editing}
      />
      <CategoryForm open={categoryOpen} onClose={() => setCategoryOpen(false)} />
    </div>
  );
}
