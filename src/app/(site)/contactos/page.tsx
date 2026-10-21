import type { Metadata } from "next";
import Link from "next/link";
import { Car, Clock3, Mail, MapPin, Phone, Train } from "lucide-react";
import { getPublicRestaurant } from "@/lib/public-data";

export const metadata: Metadata = {
  title: "Contactos",
  description: "Morada, horários e contactos do MAISON, Rua das Flores 84, Lisboa.",
};

export default function ContactsPage() {
  const restaurant = getPublicRestaurant();
  const mapsQuery = encodeURIComponent(restaurant.address);

  return (
    <div className="pt-16">
      <header className="border-b border-line bg-surface/30">
        <div className="shell py-16 sm:py-20">
          <p className="eyebrow">Contactos</p>
          <h1 className="display-xl mt-4">Encontre-nos.</h1>
          <p className="lede mt-5 max-w-xl">
            No coração de Lisboa, a poucos minutos do Chiado. Reservas por telefone, email ou em linha — sem intermediários.
          </p>
        </div>
      </header>

      <div className="shell grid gap-6 py-16 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <section className="panel p-6">
            <h2 className="font-display text-xl text-cream">Morada</h2>
            <p className="mt-3 flex items-start gap-2 text-sm text-cream-dim">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
              {restaurant.address}
            </p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
              target="_blank"
              rel="noreferrer"
              className="link-underline mt-3 inline-block text-[11px] text-gold-soft"
            >
              Abrir no Google Maps ↗
            </a>
            <div className="relative mt-5 h-56 overflow-hidden rounded-xl border border-line bg-[radial-gradient(circle_at_30%_30%,#2b241b,#12100d)]">
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(#2b2620_1px,transparent_1px),linear-gradient(90deg,#2b2620_1px,transparent_1px)] [background-size:38px_38px]" aria-hidden />
              <div className="absolute left-[44%] top-[46%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-gold/50 bg-ink/80 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-gold-soft backdrop-blur-sm">
                <MapPin className="size-3" aria-hidden /> MAISON®
              </div>
              <span className="absolute bottom-3 left-3 text-[9px] uppercase tracking-[0.14em] text-muted">Mapa ilustrativo · não é um mapa em tempo real</span>
            </div>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-xl text-cream">Como chegar</h2>
            <ul className="mt-3 space-y-3 text-[12px] text-muted">
              <li className="flex items-start gap-2">
                <Train className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
                Metro Baixa-Chiado (linha Azul/Verde), 4 minutos a pé. Elétrico 28 a 2 minutos.
              </li>
              <li className="flex items-start gap-2">
                <Car className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
                Estacionamento público a 150 m (Rua do Arsenal). Não temos estacionamento próprio.
              </li>
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="panel p-6">
            <h2 className="font-display text-xl text-cream">Horários</h2>
            <dl className="mt-4 divide-y divide-line text-sm">
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-muted">Almoço · quarta a domingo</dt>
                <dd className="text-cream">{restaurant.lunchHours}</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-muted">Jantar · quarta a sábado</dt>
                <dd className="text-cream">{restaurant.dinnerHours}</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-muted">Domingo</dt>
                <dd className="text-cream">12:00 – 16:00</dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-muted">Segunda e terça</dt>
                <dd className="text-cream">Encerrado</dd>
              </div>
            </dl>
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted">
              <Clock3 className="size-3" aria-hidden /> A cozinha encerra 30 minutos antes do fecho.
            </p>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-xl text-cream">Contactos diretos</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a href={`tel:${restaurant.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-cream-dim transition hover:text-gold-soft">
                  <Phone className="size-4 text-gold" aria-hidden /> {restaurant.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${restaurant.email}`} className="flex items-center gap-2 text-cream-dim transition hover:text-gold-soft">
                  <Mail className="size-4 text-gold" aria-hidden /> {restaurant.email}
                </a>
              </li>
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
              Para reservas de grupo (mais de 10 pessoas) e eventos privados, use o email com o assunto «Evento privado».
              Respondemos em 24 horas úteis.
            </p>
          </section>

          <div className="flex flex-wrap gap-2">
            <Link href="/reservas" className="btn btn-primary btn-sm">Reservar mesa</Link>
            <Link href="/experiencias" className="btn btn-ghost btn-sm">Eventos privados</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
