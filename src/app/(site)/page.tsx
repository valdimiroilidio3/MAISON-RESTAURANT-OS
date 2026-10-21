import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Flame, MapPin } from "lucide-react";
import { getPublicFloor, getPublicRestaurant } from "@/lib/public-data";
import { getMenuCatalog } from "@/lib/menu";
import { eur } from "@/lib/money";
import { PublicSalonPreview } from "@/components/dining/PublicSalonPreview";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const restaurant = getPublicRestaurant();
  const floor = getPublicFloor();
  const catalog = getMenuCatalog(restaurant.id);
  const featured = catalog.products.filter((p) => p.featured && p.available).slice(0, 4);
  const signature = featured.length > 0 ? featured : catalog.products.filter((p) => p.available).slice(0, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: "MAISON®",
    servesCuisine: "Portuguesa contemporânea",
    priceRange: "€€€",
    telephone: restaurant.phone,
    email: restaurant.email,
    address: { "@type": "PostalAddress", streetAddress: restaurant.address, addressCountry: "PT" },
    acceptsReservations: "https://maison.example/reservas",
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <section className="relative flex min-h-[92svh] items-end overflow-hidden">
        <Image
          src="/images/hero-room.jpg"
          alt="Sala do restaurante MAISON ao crepúsculo, com candeeiros de latão e mesas de madeira"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/85 via-ink/35 to-ink" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/80 via-transparent to-transparent" />

        <div className="shell relative z-10 pb-16 pt-32 sm:pb-20">
          <p className="animate-fade-up text-[10px] uppercase tracking-[0.32em] text-gold-soft">
            Lisboa · Rua das Flores · desde 2016
          </p>
          <h1 className="display-xl mt-5 max-w-4xl animate-fade-up [animation-delay:120ms]">
            Cozinha de autor,
            <br />
            <em className="font-normal italic text-gold-soft">fogo</em> e tempo.
          </h1>
          <p className="lede mt-6 max-w-xl animate-fade-up [animation-delay:240ms]">
            Uma casa no centro de Lisboa onde o produto manda e o tempo é um ingrediente. Brasa viva, peixe do dia e uma
            sala desenhada para demorar.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 animate-fade-up [animation-delay:360ms]">
            <Link href="/reservas" className="btn btn-primary">
              Reservar mesa <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/menu" className="btn btn-ghost">
              Explorar o menu
            </Link>
          </div>

          <dl className="mt-14 grid max-w-2xl grid-cols-3 gap-4 border-t border-cream/15 pt-5 text-[11px] uppercase tracking-[0.16em] text-cream-dim">
            <div>
              <dt className="text-muted">Almoço</dt>
              <dd className="mt-1 text-cream">{restaurant.lunchHours}</dd>
            </div>
            <div>
              <dt className="text-muted">Jantar</dt>
              <dd className="mt-1 text-cream">{restaurant.dinnerHours}</dd>
            </div>
            <div className="hidden sm:block">
              <dt className="text-muted">Sala</dt>
              <dd className="mt-1 text-cream">{floor.tables.length} mesas · {floor.capacity} lugares</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* PHILOSOPHY */}
      <section className="shell grid gap-12 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-32">
        <div>
          <p className="eyebrow">A casa</p>
          <h2 className="display-lg mt-4">
            O luxo de fazer
            <br /> as coisas devagar.
          </h2>
          <p className="lede mt-6 max-w-lg">
            Compramos a poucos produtores, cozinhamos com fogo e servimos sem pressa. O menu muda com o que o mercado
            oferece — nunca o contrário.
          </p>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
            A sala é feita de madeira escura, pedra clara e luz baixa. Há um balcão para quem vem sozinho, uma esplanada
            para o fim da tarde e uma mesa comprida para os dias em que a refeição se prolonga.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              { value: `${floor.capacity}`, label: "lugares sentados" },
              { value: `${floor.zones.length}`, label: "zonas distintas" },
              { value: "1", label: "menu sazonal" },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="font-display text-3xl text-cream">{stat.value}</dt>
                <dd className="mt-1 text-[10px] uppercase tracking-[0.16em] text-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-line">
            <Image
              src="/images/chef.jpg"
              alt="Chef a finalizar um prato na cozinha do MAISON"
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent" />
            <blockquote className="absolute inset-x-0 bottom-0 p-6">
              <p className="font-display text-xl leading-snug text-cream">
                “Não inventamos o produto. Damos-lhe tempo.”
              </p>
              <footer className="mt-2 text-[10px] uppercase tracking-[0.18em] text-gold-soft">Sofia Lopes · Chef executiva</footer>
            </blockquote>
          </div>
        </div>
      </section>

      {/* SIGNATURE DISHES */}
      <section className="border-y border-line bg-surface/40 py-24">
        <div className="shell">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Menu do momento</p>
              <h2 className="display-lg mt-3">Pratos que contam a estação.</h2>
            </div>
            <Link href="/menu" className="link-underline inline-flex items-center gap-1.5 text-xs text-gold-soft">
              Ver menu completo <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {signature.map((dish, index) => (
              <article key={dish.id} className="group">
                <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-line bg-surface-2">
                  {dish.imageUrl ? (
                    <Image
                      src={dish.imageUrl}
                      alt={dish.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition duration-700 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_40%_30%,#2a2219,#14110d)]">
                      <Flame className="size-6 text-gold/60" aria-hidden />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.18em] text-gold-soft">
                        {String(index + 1).padStart(2, "0")} · {dish.categoryName}
                      </p>
                      <h3 className="mt-1 font-display text-lg leading-tight text-cream">{dish.name}</h3>
                    </div>
                    <span className="text-sm text-cream tnum">{eur(dish.priceCents)}</span>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-muted">{dish.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 3D ROOM */}
      <section className="py-24">
        <div className="shell">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <p className="eyebrow">Salão digital</p>
              <h2 className="display-lg mt-3">Entre na sala antes de chegar.</h2>
              <p className="lede mt-4">
                Percorra o restaurante em três dimensões: a esplanada, a sala e o balcão. Cada mesa é um lugar real, com
                lugares reais para reservar.
              </p>
            </div>
            <Link href="/salon" className="btn btn-ghost">
              Abrir experiência 3D <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <div className="mt-8">
            <PublicSalonPreview floor={floor} height="h-[420px] sm:h-[540px]" />
          </div>
        </div>
      </section>

      {/* PRIVATE DINING */}
      <section className="grid lg:grid-cols-2">
        <div className="relative min-h-[420px] overflow-hidden">
          <Image
            src="/images/private-dining.jpg"
            alt="Sala privada com mesa redonda posta para oito pessoas"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-ink/25" />
        </div>
        <div className="flex flex-col justify-center border-t border-line bg-surface/50 px-6 py-16 sm:px-12 lg:border-l lg:border-t-0 lg:px-16">
          <p className="eyebrow">Eventos privados</p>
          <h2 className="display-md mt-4">Uma mesa só para os seus.</h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            A sala privada recebe até 12 pessoas, com menu desenhado para a ocasião. Para grupos maiores, a sala principal
            fecha as portas e a casa é sua.
          </p>
          <ul className="mt-6 space-y-2.5 border-t border-line pt-5 text-sm text-cream-dim">
            {["Menu de autor em 5 momentos", "Harmonização de vinhos do Douro e Alentejo", "Chef's table junto ao passe", "Serviço dedicado e horário exclusivo"].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-gold" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <Link href="/experiencias" className="btn btn-primary mt-8 self-start">
            Pedir proposta <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* GALLERY */}
      <section className="shell py-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Ambiente</p>
            <h2 className="display-lg mt-3">A luz faz parte da receita.</h2>
          </div>
          <p className="max-w-xs text-[11px] leading-relaxed text-muted">
            Fotografia de interiores e de cozinha feita na casa. Cada serviço começa com a sala preparada ao detalhe.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { src: "/images/interior-bar.jpg", alt: "Balcão de bar com garrafas iluminadas", label: "O balcão", tall: true },
            { src: "/images/dish-picanha.jpg", alt: "Picanha grelhada fatiada", label: "Brasa" },
            { src: "/images/hero-room.jpg", alt: "Sala principal ao crepúsculo", label: "A sala" },
          ].map((image) => (
            <figure key={image.src} className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-line">
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover transition duration-700 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-transparent to-transparent" />
              <figcaption className="absolute bottom-0 left-0 p-4 text-[10px] uppercase tracking-[0.2em] text-cream">
                {image.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* STORY STRIP */}
      <section className="border-y border-line bg-surface/40">
        <div className="shell grid gap-10 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-line">
            <Image src="/images/dish-risotto.jpg" alt="Risotto de açafrão em louça escura" fill sizes="(max-width: 1024px) 100vw, 32vw" className="object-cover" />
          </div>
          <div>
            <p className="eyebrow">História</p>
            <h2 className="display-lg mt-3">
              Abrimos em 2016 com uma ideia simples: <em className="italic text-gold-soft">pouca coisa, bem feita.</em>
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted">
              Dez anos depois, a cozinha é a mesma — o fogo, a sazonalidade e uma equipa que conhece os produtores pelo
              nome. Mudámos a carta centenas de vezes. Não mudámos a forma como recebemos.
            </p>
            <Link href="/historia" className="link-underline mt-6 inline-flex items-center gap-1.5 text-xs text-gold-soft">
              Conhecer a casa <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* RESERVATION BAND */}
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(198,166,107,0.14),transparent_55%)]" aria-hidden />
        <div className="shell relative grid gap-8 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="eyebrow">Reservas</p>
            <h2 className="display-xl mt-4">A mesa está posta.</h2>
            <p className="lede mt-5 max-w-md">
              Reserve em menos de um minuto. Confirmamos por email e guardamos a mesa durante 15 minutos após a hora
              marcada.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <Link href="/reservas" className="btn btn-primary w-full justify-center sm:w-auto">
              Escolher data e hora <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a href={`tel:${restaurant.phone.replace(/\s/g, "")}`} className="btn btn-ghost w-full justify-center sm:w-auto">
              {restaurant.phone}
            </a>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
              <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden /> {restaurant.address}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
