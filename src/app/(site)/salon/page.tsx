import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, KeyRound, Layers, UsersRound } from "lucide-react";
import { getPublicFloor } from "@/lib/public-data";
import { PublicSalonPreview } from "@/components/dining/PublicSalonPreview";
import { FloorPlan2D } from "@/components/dining/FloorPlan2D";

export const metadata: Metadata = {
  title: "Salão 3D",
  description: "Percorra o salão do MAISON em três dimensões: esplanada, sala e balcão. Mesas e lugares reais.",
};

export default function SalonPage() {
  const floor = getPublicFloor();
  const sceneTables = floor.tables.map((table) => ({
    ...table,
    status: undefined as never,
  }));

  const zoneCounts = floor.zones.map((zone) => ({
    ...zone,
    tables: floor.tables.filter((t) => t.zoneSlug === zone.slug).length,
    seats: floor.tables.filter((t) => t.zoneSlug === zone.slug).reduce((sum, t) => sum + t.seats, 0),
  }));

  return (
    <div className="pt-16">
      <header className="border-b border-line bg-surface/30">
        <div className="shell py-14 sm:py-20">
          <p className="eyebrow">Experiência digital</p>
          <h1 className="display-xl mt-4 max-w-3xl">O salão, em três dimensões.</h1>
          <p className="lede mt-5 max-w-xl">
            Uma representação real da sala — esplanada, sala e balcão — construída com mobiliário, materiais e iluminação.
            Arraste para orbitar, aproxime e selecione uma mesa.
          </p>
          <div className="mt-7 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-muted">
            <span className="chip"><Boxes className="size-3" aria-hidden /> {floor.tables.length} mesas</span>
            <span className="chip"><UsersRound className="size-3" aria-hidden /> {floor.capacity} lugares</span>
            <span className="chip"><Layers className="size-3" aria-hidden /> {floor.zones.length} zonas</span>
          </div>
        </div>
      </header>

      <div className="shell py-8">
        <PublicSalonPreview floor={floor} height="h-[62vh] min-h-[460px]" autoMount />
        <p className="mt-3 text-[10px] text-muted">
          Vista pública: sem estados operacionais, comissões ou dados de clientes. Os clientes são figuras 3D estilizadas,
          não retratos fotorrealistas.
        </p>
      </div>

      <div className="shell grid gap-6 pb-20 lg:grid-cols-[1.2fr_1fr]">
        <section className="panel p-5">
          <h2 className="font-display text-xl text-cream">As zonas da casa</h2>
          <ul className="mt-4 divide-y divide-line">
            {zoneCounts.map((zone) => (
              <li key={zone.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-cream">{zone.name}</p>
                  <p className="text-[11px] text-muted">Vista para a rua e luz natural</p>
                </div>
                <span className="text-[11px] text-muted tnum">{zone.tables} mesas · {zone.seats} lugares</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-5">
          <h2 className="font-display text-xl text-cream">Da vista pública à operação</h2>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            A equipa vê o mesmo salão com o estado de cada mesa: livre, reservada, ocupada, pedido pendente, a aguardar
            pagamento ou em limpeza. Cada mesa abre uma comanda real, ligada à cozinha e à conta.
          </p>
          <ul className="mt-4 space-y-2 text-[11px] text-cream-dim">
            <li className="flex items-center gap-2"><span className="status-dot bg-cream" aria-hidden /> Livre</li>
            <li className="flex items-center gap-2"><span className="status-dot bg-gold" aria-hidden /> Reservada</li>
            <li className="flex items-center gap-2"><span className="status-dot bg-amber" aria-hidden /> Ocupada</li>
            <li className="flex items-center gap-2"><span className="status-dot bg-mint" aria-hidden /> Pedido pendente</li>
            <li className="flex items-center gap-2"><span className="status-dot bg-alert" aria-hidden /> A aguardar pagamento</li>
            <li className="flex items-center gap-2"><span className="status-dot bg-slate" aria-hidden /> Em limpeza</li>
          </ul>
          <Link href="/login" className="btn btn-ghost btn-sm mt-5">
            <KeyRound className="size-3.5" aria-hidden /> Entrar na operação
          </Link>
        </section>
      </div>

      <section className="border-y border-line bg-surface/30 py-16">
        <div className="shell">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Alternativa acessível</p>
              <h2 className="display-md mt-2">Planta 2D do salão</h2>
              <p className="mt-2 max-w-lg text-sm text-muted">
                A mesma planta, sem WebGL. Navegável por teclado e compatível com leitores de ecrã.
              </p>
            </div>
            <Link href="/reservas" className="btn btn-primary btn-sm">
              Reservar mesa <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <div className="mt-6">
            <FloorPlan2D tables={sceneTables} selectedId={null} dimZone={null} mode="preview" className="h-[420px]" />
          </div>
        </div>
      </section>
    </div>
  );
}
