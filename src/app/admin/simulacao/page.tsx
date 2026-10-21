import type { Metadata } from "next";
import { Radio } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getFloorSnapshot } from "@/lib/orders";
import { getMenuCatalog } from "@/lib/menu";
import { simulationStart } from "@/lib/simulation/start";
import { PageHeader } from "@/components/admin/AdminShell";
import { LiveSalon } from "@/components/dining/LiveSalon";
import type { SimProduct, SimTable } from "@/lib/simulation/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sala ao vivo" };

export default async function SimulationPage() {
  const user = await requireRole("manager", "waiter");
  const snapshot = getFloorSnapshot(user.restaurantId);
  const catalog = getMenuCatalog(user.restaurantId);

  const tables: SimTable[] = snapshot.tables.map((table) => ({
    id: table.id,
    code: table.code,
    seats: table.seats,
    shape: table.shape,
    x: table.x,
    z: table.z,
    rotation: table.rotation,
    zoneSlug: table.zoneName.toLowerCase().replace(/\s+/g, "-"),
    zoneName: table.zoneName,
  }));

  const products: SimProduct[] = catalog.products
    .filter((product) => product.available)
    .map((product) => ({
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      category: product.categoryName,
    }));

  // The simulation starts at the real restaurant-local time, so the room is in
  // the correct service window (or closed) the moment the page opens.
  const { weekday, startMinutes, startDate, seed } = simulationStart();

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Simulação operacional"
        title="Sala ao vivo"
        description="Um serviço completo a acontecer em tempo real: clientes a entrar e a sentar-se, pedidos, cozinha, pratos retirados, mesas repostas, idas à casa de banho e contas pagas na mesa ou ao balcão."
        actions={
          <span className="chip">
            <Radio className="size-3 text-mint" aria-hidden />
            Fuso de Lisboa · {tables.length} mesas
          </span>
        }
      />

      <LiveSalon
        tables={tables}
        products={products}
        startWeekday={weekday}
        startMinutes={startMinutes}
        startDate={startDate}
        seed={seed}
      />
    </div>
  );
}
