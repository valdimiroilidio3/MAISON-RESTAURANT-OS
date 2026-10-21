import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "História",
  description: "A história do MAISON: uma casa em Lisboa, aberta em 2016, com cozinha de autor e produto sazonal.",
};

const TIMELINE = [
  { year: "2016", title: "As primeiras brasas", text: "Abrimos com 34 lugares e uma grelha. O menu tinha nove pratos." },
  { year: "2019", title: "A sala cresceu", text: "A esplanada e o balcão duplicaram a capacidade. Chega a carta de vinhos do Douro." },
  { year: "2023", title: "Cozinha aberta", text: "Reformulámos o passe para deixar a brigada à vista de quem se senta ao balcão." },
  { year: "2026", title: "MAISON OS", text: "Digitalizámos a operação sem perder o serviço de sala: o salão agora também vive em três dimensões." },
];

export default function HistoriaPage() {
  return (
    <div className="pt-16">
      <section className="relative min-h-[70svh] overflow-hidden">
        <Image src="/images/hero-room.jpg" alt="Sala do MAISON com candeeiros de latão" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/20" />
        <div className="shell relative flex min-h-[70svh] flex-col justify-end pb-16 pt-32">
          <p className="eyebrow">A casa · desde 2016</p>
          <h1 className="display-xl mt-4 max-w-3xl">Uma casa feita de tempo.</h1>
          <p className="lede mt-5 max-w-xl">
            No centro de Lisboa, entre a Baixa e o Chiado, o MAISON nasceu de uma ideia antiga: servir pouca coisa, bem
            feita, num lugar onde apeteça ficar.
          </p>
        </div>
      </section>

      <section className="shell grid gap-12 py-20 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div>
          <p className="eyebrow">Princípio</p>
          <h2 className="display-lg mt-3">Produto, fogo e hospitalidade.</h2>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Trabalhamos com uma lista curta de produtores — peixe da costa, legumes da horta, carne de pequenas
            explorações. A cozinha é comandada pelo fogo: brasa, forno, grelha. O resto é tempo: fermentações lentas,
            maturações longas, molhos que não têm pressa.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            A sala foi desenhada para a conversa. Luz baixa, mesas afastadas, som controlado. Quem entra deve sentir que o
            serviço começou no momento em que a porta abriu.
          </p>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-line">
          <Image src="/images/chef.jpg" alt="Chef a finalizar um prato com pinça" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
          <p className="absolute bottom-4 left-4 text-[10px] uppercase tracking-[0.18em] text-cream">Sofia Lopes · Chef executiva</p>
        </div>
      </section>

      <section className="border-y border-line bg-surface/30 py-16">
        <div className="shell">
          <p className="eyebrow">Cronologia</p>
          <h2 className="display-lg mt-3">Dez anos, poucas mudanças de fundo.</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TIMELINE.map((item) => (
              <li key={item.year} className="border-t border-line pt-4">
                <span className="font-display text-3xl text-gold-soft tnum">{item.year}</span>
                <h3 className="mt-2 text-sm text-cream">{item.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="shell py-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Equipa</p>
            <h2 className="display-lg mt-3">Quem faz a casa.</h2>
          </div>
          <p className="max-w-xs text-[11px] leading-relaxed text-muted">
            Uma equipa pequena, com anos de casa. A mesma brigada que cozinha é a que se lembra do seu nome na segunda
            visita.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { name: "Sofia Lopes", role: "Chef executiva", bio: "Cozinha de produto, com passagem por cozinhas de Lisboa e San Sebastián." },
            { name: "Diogo Marques", role: "Chefe de sala", bio: "Responsável pelo serviço, pelas reservas e por uma carta de vinhos em constante mudança." },
            { name: "Ana Ferreira", role: "Direção", bio: "Cuida da casa, das pessoas e da relação com os produtores." },
          ].map((person) => (
            <article key={person.name} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex size-10 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.06] font-display text-gold-soft">
                {person.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </div>
              <h3 className="mt-4 font-display text-xl text-cream">{person.name}</h3>
              <p className="text-[10px] uppercase tracking-[0.16em] text-gold">{person.role}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">{person.bio}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-surface/40 py-16">
        <div className="shell flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="display-md">A melhor forma de nos conhecer é à mesa.</h2>
            <p className="mt-2 text-sm text-muted">Reserve para almoço ou jantar — e venha com tempo.</p>
          </div>
          <Link href="/reservas" className="btn btn-primary">
            Reservar mesa <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
