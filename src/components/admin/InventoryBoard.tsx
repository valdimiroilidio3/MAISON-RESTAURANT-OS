"use client";

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDownUp, BookOpen, Loader2, Plus, Search, Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatQty, eur } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import type { Ingredient, InventoryMovement, MenuProduct, Role } from "@/lib/types";
import { idleAction, type ActionState } from "@/lib/action-types";
import { adjustStockAction, createIngredientAction, saveRecipeAction } from "@/app/actions/inventory";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";

export function InventoryBoard({
  ingredients,
  movements,
  products,
  role,
}: {
  ingredients: Ingredient[];
  movements: InventoryMovement[];
  products: MenuProduct[];
  role: Role;
}) {
  const [query, setQuery] = useState("");
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null);
  const [creating, setCreating] = useState(false);
  const [recipeProduct, setRecipeProduct] = useState<MenuProduct | null>(null);
  const [tab, setTab] = useState<"stock" | "movements" | "recipes">("stock");
  const isManager = role === "manager";

  const low = ingredients.filter((i) => i.low);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return ingredients.filter((i) => !term || i.name.toLowerCase().includes(term) || i.supplier.toLowerCase().includes(term));
  }, [ingredients, query]);

  const stockValue = ingredients.reduce((sum, i) => sum + i.stockQty * i.unitCostCents, 0);

  return (
    <div className="space-y-4">
      {low.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-alert/35 bg-alert/[0.07] px-4 py-3">
          <p className="flex items-center gap-2 text-xs text-alert">
            <AlertTriangle className="size-4" aria-hidden />
            {low.length} ingrediente(s) abaixo do nível de reposição
          </p>
          <p className="text-[11px] text-alert/80">{low.map((i) => i.name).join(" · ")}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-0.5">
          {[
            { key: "stock", label: "Stock" },
            { key: "movements", label: "Movimentos" },
            { key: "recipes", label: "Receitas" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key as typeof tab)}
              aria-pressed={tab === item.key}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] transition",
                tab === item.key ? "bg-cream text-ink" : "text-muted hover:text-cream",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip tnum">valor em stock {eur(stockValue)}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)} disabled={!isManager}>
            <Plus className="size-3.5" aria-hidden /> Ingrediente
          </button>
        </div>
      </div>

      {tab === "stock" && (
        <section className="panel overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm text-cream">Ingredientes</h2>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar..." className="field h-8 w-44 pl-7 text-xs" aria-label="Procurar ingrediente" />
            </div>
          </header>
          <div className="scroll-x">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Ingrediente</th>
                  <th className="px-4 py-2 font-medium">Stock</th>
                  <th className="px-4 py-2 font-medium">Mínimo</th>
                  <th className="px-4 py-2 font-medium">Custo/un.</th>
                  <th className="px-4 py-2 font-medium">Fornecedor</th>
                  <th className="px-4 py-2 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {filtered.map((ingredient) => (
                  <tr key={ingredient.id} className={cn("table-row-hover", ingredient.low && "bg-alert/[0.04]")}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 text-cream">
                        {ingredient.name}
                        {ingredient.low && <AlertTriangle className="size-3 text-alert" aria-label="Stock baixo" />}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("tnum", ingredient.low ? "text-alert" : "text-cream-dim")}>
                        {formatQty(ingredient.stockQty)} {ingredient.unit}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted tnum">{formatQty(ingredient.reorderLevel)} {ingredient.unit}</td>
                    <td className="px-4 py-2.5 text-muted tnum">{eur(ingredient.unitCostCents)}</td>
                    <td className="px-4 py-2.5 text-muted">
                      <span className="inline-flex items-center gap-1"><Truck className="size-3" aria-hidden /> {ingredient.supplier || "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAdjusting(ingredient)}>
                        <ArrowDownUp className="size-3" aria-hidden /> Movimento
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="p-4"><EmptyState icon={Search} title="Sem resultados" /></div>}
        </section>
      )}

      {tab === "movements" && (
        <section className="panel overflow-hidden">
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-sm text-cream">Movimentos de inventário</h2>
            <p className="text-[11px] text-muted">Cada envio de comanda dá baixa automática conforme a receita configurada.</p>
          </header>
          <div className="scroll-x">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Ingrediente</th>
                  <th className="px-4 py-2 font-medium">Movimento</th>
                  <th className="px-4 py-2 font-medium">Motivo</th>
                  <th className="px-4 py-2 font-medium">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {movements.map((movement) => (
                  <tr key={movement.id} className="table-row-hover">
                    <td className="px-4 py-2 text-muted tnum">{formatDateTime(movement.createdAt)}</td>
                    <td className="px-4 py-2 text-cream">{movement.ingredientName}</td>
                    <td className={cn("px-4 py-2 tnum", movement.delta > 0 ? "text-mint" : "text-cream-dim")}>
                      {movement.delta > 0 ? "+" : ""}
                      {formatQty(movement.delta)} {movement.unit}
                    </td>
                    <td className="px-4 py-2 text-muted">{movement.reason}</td>
                    <td className="px-4 py-2 text-muted">{movement.actorName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "recipes" && (
        <section className="panel overflow-hidden">
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-sm text-cream">Receitas e baixa automática</h2>
            <p className="text-[11px] text-muted">
              A baixa de stock só acontece para produtos com receita configurada. Produtos sem receita não alteram inventário.
            </p>
          </header>
          <ul className="divide-y divide-line/70">
            {products.map((product) => (
              <li key={product.id} className="table-row-hover flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-xs text-cream">{product.name}</p>
                  <p className="text-[11px] text-muted">
                    {product.recipe.length === 0
                      ? "Sem receita — não dá baixa de stock"
                      : product.recipe.map((line) => `${formatQty(line.qty)} ${line.unit} ${line.name}`).join(" · ")}
                  </p>
                </div>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setRecipeProduct(product)}>
                  <BookOpen className="size-3" aria-hidden /> Editar receita
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AdjustStockModal
        key={adjusting?.id ?? "none"}
        ingredient={adjusting}
        onClose={() => setAdjusting(null)}
      />
      <NewIngredientModal open={creating} onClose={() => setCreating(false)} />
      <RecipeModal
        key={recipeProduct?.id ?? "recipe-none"}
        product={recipeProduct}
        ingredients={ingredients}
        onClose={() => setRecipeProduct(null)}
      />
    </div>
  );
}

function AdjustStockModal({ ingredient, onClose }: { ingredient: Ingredient | null; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("");
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await adjustStockAction(previous, formData);
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
    <Modal open={!!ingredient} onClose={onClose} title={ingredient ? `Movimento · ${ingredient.name}` : "Movimento"} width="max-w-md">
      {ingredient && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="ingredientId" value={ingredient.id} />
          <p className="rounded-md bg-surface-2 px-3 py-2 text-[11px] text-muted">
            Stock atual: <span className="text-cream tnum">{formatQty(ingredient.stockQty)} {ingredient.unit}</span>
          </p>
          <div>
            <span className="label">Tipo</span>
            <div className="flex gap-1.5">
              <button type="button" aria-pressed={direction === "in"} onClick={() => setDirection("in")} className={cn("chip flex-1 justify-center", direction === "in" && "border-mint/50 text-mint")}>
                Entrada
              </button>
              <button type="button" aria-pressed={direction === "out"} onClick={() => setDirection("out")} className={cn("chip flex-1 justify-center", direction === "out" && "border-alert/50 text-alert")}>
                Saída
              </button>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="delta-qty">
              Quantidade ({ingredient.unit})
            </label>
            <input
              id="delta-qty"
              required
              inputMode="decimal"
              className="field tnum"
              placeholder="0,00"
              value={qty}
              onChange={(event) => setQty(event.target.value.replace(/[^0-9,.]/g, ""))}
            />
            <input type="hidden" name="delta" value={direction === "out" ? `-${qty}` : qty} />
            <p className="mt-1 text-[10px] text-muted">O movimento e o motivo ficam registados no histórico com o seu nome.</p>
          </div>
          <div>
            <label className="label" htmlFor="delta-reason">
              Motivo
            </label>
            <input id="delta-reason" name="reason" required className="field" placeholder="Compra, quebra, contagem..." />
          </div>
          {state.message && !state.ok && <p className="text-xs text-alert">{state.message}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Registar movimento
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function NewIngredientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await createIngredientAction(previous, formData);
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
    <Modal open={open} onClose={onClose} title="Novo ingrediente" description="Stock inicial e nível de reposição definem os alertas.">
      <form action={action} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
          <div>
            <label className="label" htmlFor="ing-name">
              Nome
            </label>
            <input id="ing-name" name="name" required className="field" />
          </div>
          <div>
            <label className="label" htmlFor="ing-unit">
              Unidade
            </label>
            <select id="ing-unit" name="unit" className="field">
              {["kg", "g", "L", "cl", "un"].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="ing-stock">
              Stock inicial
            </label>
            <input id="ing-stock" name="initialStock" inputMode="decimal" defaultValue="0" className="field tnum" />
          </div>
          <div>
            <label className="label" htmlFor="ing-reorder">
              Mínimo
            </label>
            <input id="ing-reorder" name="reorderLevel" inputMode="decimal" defaultValue="0" className="field tnum" />
          </div>
          <div>
            <label className="label" htmlFor="ing-cost">
              Custo (€)
            </label>
            <input id="ing-cost" name="unitCost" inputMode="decimal" defaultValue="0,00" className="field tnum" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ing-supplier">
            Fornecedor
          </label>
          <input id="ing-supplier" name="supplier" className="field" />
        </div>
        {state.message && !state.ok && <p className="text-xs text-alert">{state.message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Criar ingrediente
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RecipeModal({
  product,
  ingredients,
  onClose,
}: {
  product: MenuProduct | null;
  ingredients: Ingredient[];
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      const result = await saveRecipeAction(previous, formData);
      if (result.ok) {
        toast.push(result.message, "success");
        router.refresh();
        onClose();
      }
      return result;
    },
    idleAction,
  );

  const current = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of product?.recipe ?? []) map.set(line.ingredientId, line.qty);
    return map;
  }, [product]);

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={product ? `Receita · ${product.name}` : "Receita"}
      description="Quantidade consumida por unidade vendida. Deixe vazio para não usar o ingrediente."
      width="max-w-2xl"
    >
      {product && (
        <form action={action} className="space-y-3">
          <input type="hidden" name="productId" value={product.id} />
          <ul className="scroll-area max-h-[48vh] divide-y divide-line rounded-lg border border-line">
            {ingredients.map((ingredient) => (
              <li key={ingredient.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <p className="text-xs text-cream">{ingredient.name}</p>
                  <p className="text-[10px] text-muted">stock {formatQty(ingredient.stockQty)} {ingredient.unit}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    name={`ingredient_${ingredient.id}`}
                    inputMode="decimal"
                    defaultValue={current.has(ingredient.id) ? String(current.get(ingredient.id)) : ""}
                    className="field h-8 w-20 text-right tnum"
                    placeholder="0"
                    aria-label={`Quantidade de ${ingredient.name} (${ingredient.unit})`}
                  />
                  <span className="w-6 text-[10px] text-muted">{ingredient.unit}</span>
                </div>
              </li>
            ))}
          </ul>
          {state.message && !state.ok && <p className="text-xs text-alert">{state.message}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
              {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Guardar receita
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
