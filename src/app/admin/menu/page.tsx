import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getMenuCatalog } from "@/lib/menu";
import { PageHeader } from "@/components/admin/AdminShell";
import { MenuManager } from "@/components/admin/MenuManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage() {
  const user = await requireRole("manager");
  const catalog = getMenuCatalog(user.restaurantId);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Menu & produtos"
        title="Gestão de menu"
        description="Categorias, preços, alergénios, tempos de preparação e disponibilidade. Alterações refletem-se imediatamente no website."
        actions={
          <Link href="/menu" className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">
            Ver menu público ↗
          </Link>
        }
      />
      <MenuManager catalog={catalog} />
    </div>
  );
}
