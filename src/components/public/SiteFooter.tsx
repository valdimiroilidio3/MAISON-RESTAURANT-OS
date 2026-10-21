import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import type { RestaurantConfig } from "@/lib/types";

export function SiteFooter({ restaurant }: { restaurant: RestaurantConfig }) {
  return (
    <footer className="border-t border-line bg-surface/40">
      <div className="shell grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{restaurant.tagline}</p>
          <div className="mt-5 flex gap-2">
            <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" aria-label="Instagram">
              Instagram
            </a>
            <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" aria-label="LinkedIn">
              LinkedIn
            </a>
          </div>
        </div>

        <div>
          <p className="eyebrow">Navegar</p>
          <ul className="mt-4 space-y-2 text-sm text-cream-dim">
            {[
              { href: "/menu", label: "Menu" },
              { href: "/salon", label: "Salão 3D" },
              { href: "/reservas", label: "Reservas" },
              { href: "/experiencias", label: "Eventos privados" },
              { href: "/historia", label: "História" },
            ].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition hover:text-gold-soft">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow">Horários</p>
          <ul className="mt-4 space-y-2 text-sm text-cream-dim">
            <li>
              <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">Almoço</span>
              {restaurant.lunchHours}
            </li>
            <li>
              <span className="block text-[11px] uppercase tracking-[0.14em] text-muted">Jantar</span>
              {restaurant.dinnerHours}
            </li>
            <li className="text-muted">Segunda e terça: encerrado</li>
          </ul>
        </div>

        <div>
          <p className="eyebrow">Contactos</p>
          <ul className="mt-4 space-y-3 text-sm text-cream-dim">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-gold" aria-hidden />
              {restaurant.address}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-3.5 shrink-0 text-gold" aria-hidden />
              <a href={`tel:${restaurant.phone.replace(/\s/g, "")}`} className="transition hover:text-gold-soft">
                {restaurant.phone}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="size-3.5 shrink-0 text-gold" aria-hidden />
              <a href={`mailto:${restaurant.email}`} className="transition hover:text-gold-soft">
                {restaurant.email}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="shell flex flex-wrap items-center justify-between gap-3 py-5 text-[11px] text-muted">
          <p>© {new Date().getFullYear()} MAISON® · Todos os direitos reservados · NIF 509 000 000</p>
          <div className="flex items-center gap-4">
            <Link href="/reservas" className="transition hover:text-cream">Política de reservas</Link>
            <Link href="/login" className="inline-flex items-center gap-1 transition hover:text-cream">
              MAISON OS <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
