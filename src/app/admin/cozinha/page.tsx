import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listKitchenTickets } from "@/lib/orders";
import { PageHeader } from "@/components/admin/AdminShell";
import { KitchenBoard } from "@/components/admin/KitchenBoard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cozinha · KDS" };

export default async function KitchenPage() {
  const user = await requireUser();
  const payload = listKitchenTickets(user.restaurantId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Kitchen Display System"
        title="Cozinha"
        description="Pedidos enviados pela sala, ordenados por antiguidade e prioridade. Atualização automática a cada 5 segundos."
      />
      <KitchenBoard initial={payload} role={user.role} />
    </div>
  );
}
