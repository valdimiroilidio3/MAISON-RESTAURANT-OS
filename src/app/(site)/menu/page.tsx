import type { Metadata } from "next";
import { getPublicMenu } from "@/lib/menu";
import { MenuExplorer } from "@/components/public/MenuExplorer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Menu",
  description: "Menu sazonal do MAISON: entradas, brasa, pratos de autor, sobremesas e bar. Preços com IVA incluído.",
};

export default function MenuPage() {
  const { catalog, restaurant } = getPublicMenu();

  return (
    <div className="pt-16">
      <header className="border-b border-line bg-surface/30">
        <div className="shell py-16 sm:py-20">
          <p className="eyebrow">Menu</p>
          <h1 className="display-xl mt-4 max-w-3xl">O que a estação nos deu.</h1>
          <p className="lede mt-5 max-w-xl">
            Carta sazonal, alterada com o mercado. Todos os preços incluem IVA à taxa legal em vigor. Informe a equipa
            sobre alergias ou restrições alimentares.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 text-[11px] uppercase tracking-[0.16em] text-muted">
            <div>
              <dt className="text-muted/70">Almoço</dt>
              <dd className="mt-1 text-cream">{restaurant.lunchHours}</dd>
            </div>
            <div>
              <dt className="text-muted/70">Jantar</dt>
              <dd className="mt-1 text-cream">{restaurant.dinnerHours}</dd>
            </div>
            <div>
              <dt className="text-muted/70">Cozinha</dt>
              <dd className="mt-1 text-cream">Sofia Lopes</dd>
            </div>
            <div>
              <dt className="text-muted/70">IVA</dt>
              <dd className="mt-1 text-cream">23% incluído</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="shell pb-24 pt-6">
        <MenuExplorer catalog={catalog} />
      </div>
    </div>
  );
}
