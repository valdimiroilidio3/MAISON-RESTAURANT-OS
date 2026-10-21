import type { Metadata } from "next";
import { Info } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getFloorSnapshot } from "@/lib/orders";
import { getMenuCatalog } from "@/lib/menu";
import { PageHeader } from "@/components/admin/AdminShell";
import { FloorWorkspace } from "@/components/dining/FloorWorkspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Salão 3D" };

export default async function FloorPage() {
  const user = await requireRole("manager", "waiter");
  const snapshot = getFloorSnapshot(user.restaurantId);
  const catalog = getMenuCatalog(user.restaurantId);
  const late = snapshot.tables.filter((t) => t.status === "awaiting_payment").length;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Operação de sala"
        title="Salão"
        description="Selecione uma mesa no 3D para abrir, editar e fechar comandas. A planta 2D espelha a mesma informação."
        actions={
          <span className="chip">
            <Info className="size-3" aria-hidden />
            {snapshot.stats.available} livres · {late} a aguardar pagamento
          </span>
        }
      />
      <FloorWorkspace initialSnapshot={snapshot} catalog={catalog} role={user.role} mode="operations" />
    </div>
  );
}
