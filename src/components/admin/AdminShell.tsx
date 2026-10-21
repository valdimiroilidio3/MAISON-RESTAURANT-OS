"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  ChefHat,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  ShieldCheck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ROLE_LABEL } from "@/lib/status";
import type { Role, SessionUser } from "@/lib/types";
import { Logo } from "@/components/ui/Logo";
import { signOutAction } from "@/app/actions/auth";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  hint: string;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard, roles: ["manager", "waiter", "chef"], hint: "turno" },
  { href: "/admin/sala", label: "Salão 3D", icon: UtensilsCrossed, roles: ["manager", "waiter"], hint: "mesas" },
  { href: "/admin/cozinha", label: "Cozinha", icon: ChefHat, roles: ["manager", "chef", "waiter"], hint: "KDS" },
  { href: "/admin/reservas", label: "Reservas", icon: CalendarDays, roles: ["manager", "waiter"], hint: "agenda" },
  { href: "/admin/menu", label: "Menu", icon: MenuIcon, roles: ["manager"], hint: "produtos" },
  { href: "/admin/inventario", label: "Inventário", icon: Boxes, roles: ["manager", "chef"], hint: "stock" },
  { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3, roles: ["manager"], hint: "finanças" },
  { href: "/admin/configuracoes", label: "Configurações", icon: ShieldCheck, roles: ["manager"], hint: "auditoria" },
];

export function AdminShell({
  user,
  liveBadge,
  children,
}: {
  user: SessionUser;
  liveBadge?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((item) => item.roles.includes(user.role));

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5" aria-label="Navegação do painel">
      {items.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="nav-item"
            onClick={() => setOpen(false)}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{item.label}</span>
            <span className="text-[9px] uppercase tracking-[0.1em] text-muted/70">{item.hint}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-ink">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[120] focus:rounded-md focus:bg-cream focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        Saltar para o conteúdo
      </a>

      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface/70 px-3 py-4 lg:flex">
          <div className="px-2">
            <Logo href="/admin" compact />
          </div>
          <p className="mt-5 px-2 text-[9px] uppercase tracking-[0.2em] text-muted/70">Operações</p>
          <div className="mt-1.5 flex-1">{nav}</div>

          <div className="mt-4 rounded-xl border border-line bg-surface-2/60 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted">{user.restaurantName}</p>
            <p className="mt-1 text-sm text-cream">{user.name}</p>
            <p className="text-[10px] text-gold-soft">{ROLE_LABEL[user.role]}</p>
            <form action={signOutAction} className="mt-2.5">
              <button type="submit" className="btn btn-ghost btn-xs w-full">
                <LogOut className="size-3" aria-hidden /> Terminar sessão
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
            <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm !p-2 lg:hidden"
                  onClick={() => setOpen(true)}
                  aria-label="Abrir menu"
                >
                  <MenuIcon className="size-4" aria-hidden />
                </button>
                <div className="lg:hidden">
                  <Logo href="/admin" compact />
                </div>
                <div className="hidden items-center gap-2 text-xs text-muted lg:flex">
                  <span className="status-dot bg-mint" aria-hidden />
                  <span>Serviço em direto</span>
                  {liveBadge && <span className="text-muted/70">· {liveBadge}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/" className="hidden text-[11px] text-muted transition hover:text-cream sm:inline">
                  Ver website ↗
                </Link>
                <span className="hidden text-[11px] text-muted md:inline">{user.email}</span>
                <span className="chip border-gold/30 bg-gold/[0.07] text-gold-soft">{ROLE_LABEL[user.role]}</span>
                <form action={signOutAction} className="lg:hidden">
                  <button type="submit" className="btn btn-ghost btn-xs !p-2" aria-label="Terminar sessão">
                    <LogOut className="size-3.5" aria-hidden />
                  </button>
                </form>
              </div>
            </div>
          </header>

          <main id="conteudo" className="px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <button type="button" className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Fechar menu" />
          <div className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-line bg-surface p-3">
            <div className="flex items-center justify-between px-2 py-2">
              <Logo href="/admin" compact />
              <button type="button" className="btn btn-ghost btn-xs !p-2" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-3 flex-1">{nav}</div>
            <div className="rounded-xl border border-line bg-surface-2/60 p-3">
              <p className="text-sm text-cream">{user.name}</p>
              <p className="text-[10px] text-gold-soft">{ROLE_LABEL[user.role]} · {user.restaurantName}</p>
              <form action={signOutAction} className="mt-2">
                <button type="submit" className="btn btn-ghost btn-xs w-full">
                  <LogOut className="size-3" aria-hidden /> Terminar sessão
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-3xl text-cream sm:text-[2rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-cream">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] text-muted">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
