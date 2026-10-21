"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/Logo";

const LINKS = [
  { href: "/menu", label: "Menu" },
  { href: "/salon", label: "Salão 3D" },
  { href: "/experiencias", label: "Experiências" },
  { href: "/historia", label: "História" },
  { href: "/contactos", label: "Contactos" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isHome = pathname === "/";
  const solid = scrolled || !isHome;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        solid ? "border-b border-line/80 bg-ink/85 backdrop-blur-xl" : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="shell flex h-16 items-center justify-between gap-6">
        <Logo />

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "link-underline text-[12px] tracking-[0.06em] transition",
                  active ? "text-gold-soft" : "text-cream-dim hover:text-cream",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/reservas" className="btn btn-primary btn-sm hidden sm:inline-flex">
            Reservar mesa
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm !p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={open}
          >
            <Menu className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-ink/85 backdrop-blur" onClick={() => setOpen(false)} aria-label="Fechar menu" />
          <div className="relative flex h-full flex-col bg-surface px-6 py-6">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" className="btn btn-ghost btn-sm !p-2" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <nav className="mt-10 flex flex-col gap-1" aria-label="Navegação móvel">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="border-b border-line py-4 font-display text-2xl text-cream transition hover:text-gold-soft"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto space-y-3">
              <Link href="/reservas" className="btn btn-primary w-full">
                Reservar mesa
              </Link>
              <p className="text-center text-[11px] text-muted">Rua das Flores 84, Lisboa · +351 213 456 789</p>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
