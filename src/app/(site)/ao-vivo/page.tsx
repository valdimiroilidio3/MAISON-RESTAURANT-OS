import type { Metadata } from "next";
import { ArrowRight, Radio } from "lucide-react";
import Link from "next/link";
import { getPublicFloor } from "@/lib/public-data";
import { getPublicMenu } from "@/lib/menu";
import { simulationStart } from "@/lib/simulation/start";
import { LiveSalon } from "@/components/dining/LiveSalon";
import type { SimProduct, SimTable } from "@/lib/simulation/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sala ao vivo",
  description:
    "Uma simulação contínua do serviço da MAISON: clientes a entrar, pedidos, cozinha, mesas repostas, contas pagas na mesa ou ao balcão — ao ritmo do relógio de Lisboa.",
};

export default function LivePage() {
  const floor = getPublicFloor();
  const { catalog } = getPublicMenu();

  const tables: SimTable[] = floor.tables.map((table) => ({
    id: table.id,
    code: table.code,
    seats: table.seats,
    shape: table.shape,
    x: table.x,
    z: table.z,
    rotation: table.rotation,
    zoneSlug: table.zoneSlug,
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

  const { weekday, startMinutes, startDate, seed } = simulationStart();

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-24 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="eyebrow flex items-center gap-2">
            <Radio className="size-3 text-mint" aria-hidden />
            Sala ao vivo · simulação
          </p>
          <h1 className="mt-2 font-display text-4xl leading-tight text-cream sm:text-5xl">Um serviço a acontecer.</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Esta é uma simulação contínua do nosso salão, não uma transmissão de câmara. Ao longo do dia os clientes
            entram ao ritmo do serviço, pedem, comem, vão à casa de banho, pagam na mesa ou ao balcão e as mesas são
            repostas para os seguintes. O relógio segue o fuso de Lisboa: almoço 12:00–15:00, jantar 19:00–23:00,
            encerrado à segunda e à terça. As figuras 3D são estilizadas, não fotorrealistas.
          </p>
        </div>
        <Link href="/salon" className="btn btn-ghost btn-sm">
          Explorar o salão 3D
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <div className="mt-8">
        <LiveSalon
          tables={tables}
          products={products}
          startWeekday={weekday}
          startMinutes={startMinutes}
          startDate={startDate}
          seed={seed}
        />
      </div>
    </div>
  );
}
