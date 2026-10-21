import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Mail } from "lucide-react";
import { getPublicRestaurant } from "@/lib/public-data";

export const metadata: Metadata = {
  title: "Experiências & eventos privados",
  description: "Sala privada, chef's table e harmonizações no MAISON. Eventos até 12 pessoas na sala privada e casa completa para grupos maiores.",
};

const EXPERIENCES = [
  {
    title: "Sala privada",
    meta: "até 12 pessoas · menu de 5 momentos",
    description:
      "Uma sala fechada, com mesa redonda, serviço dedicado e menu desenhado para a ocasião. Ideal para jantares de empresa ou celebrações.",
    includes: ["Menu de autor em 5 momentos", "Serviço de sala dedicado", "Horário exclusivo até à 01:00"],
    image: "/images/private-dining.jpg",
  },
  {
    title: "Chef's table",
    meta: "até 6 pessoas · junto ao passe",
    description:
      "Seis lugares ao balcão da cozinha, com o chef Sofia Lopes a explicar cada prato. Menu surpresa, ditado pelo mercado do dia.",
    includes: ["Menu surpresa de 7 momentos", "Conversa com a brigada", "Harmonização opcional"],
    image: "/images/chef.jpg",
  },
  {
    title: "Harmonização",
    meta: "grupos de 8 a 20 · na sala principal",
    description:
      "Uma prova guiada de vinhos portugueses com pratos pensados para cada garrafa. A casa adapta-se: mesas juntas, menu único.",
    includes: ["5 vinhos, 5 pratos", "Sommelier convidado", "Duração aproximada de 3 horas"],
    image: "/images/interior-bar.jpg",
  },
];

const STEPS = [
  { title: "1 · Conversa", text: "Diga-nos a data, o número de pessoas e o motivo. Respondemos em 24 horas." },
  { title: "2 · Proposta", text: "Enviamos um menu e um orçamento fechado, com opções de vinho." },
  { title: "3 · Confirmação", text: "Reservamos a sala e o sinal. O menu final fica fechado uma semana antes." },
];

export default function ExperiencesPage() {
  const restaurant = getPublicRestaurant();
  const mailto = `mailto:${restaurant.email}?subject=${encodeURIComponent("Evento privado no MAISON")}`;

  return (
    <div className="pt-16">
      <header className="border-b border-line bg-surface/30">
        <div className="shell py-16 sm:py-20">
          <p className="eyebrow">Experiências</p>
          <h1 className="display-xl mt-4 max-w-3xl">Momentos que a casa guarda.</h1>
          <p className="lede mt-5 max-w-xl">
            Jantares privados, chef's table e harmonizações. Trabalhamos com um número limitado de eventos por semana para
            garantir o mesmo nível de serviço.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={mailto} className="btn btn-primary">
              Pedir proposta <Mail className="size-4" aria-hidden />
            </a>
            <Link href="/reservas" className="btn btn-ghost">
              Reservar mesa
            </Link>
          </div>
        </div>
      </header>

      <section className="shell space-y-16 py-20">
        {EXPERIENCES.map((experience, index) => (
          <article key={experience.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <div className={`relative aspect-[4/3] overflow-hidden rounded-2xl border border-line ${index % 2 === 1 ? "lg:order-2" : ""}`}>
              <Image
                src={experience.image}
                alt={experience.title}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold">{experience.meta}</p>
              <h2 className="display-md mt-3">{experience.title}</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{experience.description}</p>
              <ul className="mt-5 space-y-2 border-t border-line pt-4 text-sm text-cream-dim">
                {experience.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[11px] text-muted">Valor sob consulta, definido pela ocasião e pelo menu.</p>
              <a href={mailto} className="link-underline mt-4 inline-flex items-center gap-1.5 text-xs text-gold-soft">
                Falar com a equipa <ArrowRight className="size-3.5" aria-hidden />
              </a>
            </div>
          </article>
        ))}
      </section>

      <section className="border-y border-line bg-surface/30 py-16">
        <div className="shell">
          <p className="eyebrow">Como funciona</p>
          <h2 className="display-md mt-3">Três passos, sem complicações.</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.title} className="border-t border-line pt-4">
                <h3 className="text-sm text-cream">{step.title}</h3>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="shell py-16">
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <h2 className="display-md">Casa completa</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
                Para grupos até 60 pessoas, fechamos o restaurante em exclusivo: sala, balcão e esplanada, com menu único e
                equipa dedicada. Disponível para almoços de empresa e eventos de marca.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <a href={mailto} className="btn btn-gold justify-center">
                Pedir proposta <ArrowRight className="size-4" aria-hidden />
              </a>
              <a href={`tel:${restaurant.phone.replace(/\s/g, "")}`} className="btn btn-ghost justify-center">
                {restaurant.phone}
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
