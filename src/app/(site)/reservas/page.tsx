import type { Metadata } from "next";
import Image from "next/image";
import { Clock3, MapPin, Sparkles } from "lucide-react";
import { getPublicRestaurant } from "@/lib/public-data";
import { ReservationFlow } from "@/components/public/ReservationFlow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reservas",
  description: "Reserve mesa no MAISON. Almoço 12:00–14:30, jantar 19:00–22:00. Mesas para 1 a 10 pessoas.",
};

export default function ReservationsPage() {
  const restaurant = getPublicRestaurant();

  return (
    <div className="pt-16">
      <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative hidden min-h-[720px] overflow-hidden border-r border-line lg:block">
          <Image
            src="/images/private-dining.jpg"
            alt="Mesa posta em sala privada do MAISON"
            fill
            priority
            sizes="45vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/10" />
          <div className="absolute inset-x-0 bottom-0 p-10">
            <p className="eyebrow">Reservas</p>
            <h1 className="display-lg mt-3 max-w-md">A sua mesa, à sua hora.</h1>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream-dim">
              A confirmação aparece no ecrã e fica registada para a equipa de sala. Em noites de serviço completo, a lista de espera é gerida pela equipa.
            </p>
            <ul className="mt-7 space-y-2 text-[11px] text-muted">
              <li className="flex items-center gap-2">
                <Clock3 className="size-3.5 text-gold" aria-hidden /> Almoço {restaurant.lunchHours} · Jantar {restaurant.dinnerHours}
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="size-3.5 text-gold" aria-hidden /> {restaurant.address}
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-gold" aria-hidden /> Mesas de 1 a 10 pessoas · grupos por telefone
              </li>
            </ul>
          </div>
        </div>

        <div className="px-5 py-12 sm:px-10 lg:px-14 lg:py-20">
          <div className="mx-auto w-full max-w-lg">
            <div className="lg:hidden">
              <p className="eyebrow">Reservas</p>
              <h1 className="display-md mt-2">A sua mesa, à sua hora.</h1>
            </div>
            <h2 className="hidden font-display text-3xl text-cream lg:block">Escolher mesa</h2>
            <p className="mt-2 mb-6 text-sm text-muted">
              Escolha o número de pessoas, o dia e a hora. A disponibilidade é verificada em tempo real contra as reservas
              e a lotação do salão.
            </p>
            <ReservationFlow phone={restaurant.phone} />
            <div className="mt-6 grid gap-2 text-[11px] text-muted sm:grid-cols-2">
              <p className="rounded-lg border border-line bg-surface px-3 py-2">
                <span className="block text-cream">Cancelamento</span>
                Até 4 horas antes, sem custos.
              </p>
              <p className="rounded-lg border border-line bg-surface px-3 py-2">
                <span className="block text-cream">Tolerância</span>
                15 minutos após a hora marcada.
              </p>
            </div>
            <p className="mt-6 text-[10px] leading-relaxed text-muted">
              Os dados são usados apenas para gerir a reserva. Esta demonstração não envia emails nem SMS — a confirmação
              final é feita pela equipa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
