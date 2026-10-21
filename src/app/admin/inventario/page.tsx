import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { listIngredients, listStockMovements } from "@/lib/inventory";
import { getMenuCatalog } from "@/lib/menu";
import { PageHeader } from "@/components/admin/AdminShell";
import { InventoryBoard } from "@/components/admin/InventoryBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inventário" };

export default async function InventoryPage() {
  const user = await requireRole("manager", "chef");
  const [ingredients, movements, catalog] = await Promise.all([
    Promise.resolve(listIngredients(user.restaurantId)),
    Promise.resolve(listStockMovements(user.restaurantId, 60)),
    Promise.resolve(getMenuCatalog(user.restaurantId)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Menu & inventário"
        title="Inventário"
        description="Stock por ingrediente, movimentos auditados e receitas que alimentam a baixa automática."
      />
      <InventoryBoard ingredients={ingredients} movements={movements} products={catalog.products} role={user.role} />
    </div>
  );
}
