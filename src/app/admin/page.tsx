import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ChefHat,
  CircleDollarSign,
  Flame,
  UsersRound,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getFloorSnapshot, listKitchenTickets } from "@/lib/orders";
import { getMenuCatalog } from "@/lib/menu";
import { listReservations } from "@/lib/reservations";
import { getReports } from "@/lib/reports";
import { listIngredients } from "@/lib/inventory";
import { eur } from "@/lib/money";
import { formatTime, localDate } from "@/lib/dates";
import { TableStatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader, SectionCard } from "@/components/admin/AdminShell";
import { FloorWorkspace } from "@/components/dining/FloorWorkspace";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReservationStatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "text-cream",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Flame;
  tone?: string;
  href?: string;
}) {
  const content = (
    <div className="panel flex h-full flex-col justify-between p-4 transition hover:border-line-strong">
      <div className="flex items-start justify-between">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
        <Icon className="size-4 text-muted/70" aria-hidden />
      </div>
      <div className="mt-3">
        <p className={cn("font-display text-2xl leading-none tnum", tone)}>{value}</p>
        {hint && <p className="mt-1.5 text-[10px] text-muted">{hint}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{content}</Link> : content;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [snapshot, kitchen, catalog] = await Promise.all([
    Promise.resolve(getFloorSnapshot(user.restaurantId)),
    Promise.resolve(listKitchenTickets(user.restaurantId)),
    Promise.resolve(getMenuCatalog(user.restaurantId)),
  ]);
  const today = localDate(0);
  const reservations = listReservations(user.restaurantId, { from: today, to: today, status: "all" });
  const lowStock = listIngredients(user.restaurantId).filter((i) => i.low);
  const canSeeMoney = user.role === "manager" || user.role === "waiter";
  const report = canSeeMoney ? getReports(user.restaurantId, today, today) : null;
  const lateTickets = kitchen.tickets.filter((t) => t.late);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Turno de hoje"
        title={`Boa noite, ${user.name.split(" ")[0]}.`}
        description="Estado operacional em tempo real. Todas as ações são registadas com autor, data e comanda."
        actions={
          <Link href="/admin/sala" className="btn btn-primary btn-sm">
            Abrir salão <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canSeeMoney && report ? (
          <>
            <Kpi
              label="Receita confirmada hoje"
              value={eur(report.confirmedCents)}
              hint={`${report.ordersClosed} comandas fechadas · ${report.guestsServed} pax`}
              icon={CircleDollarSign}
              tone="text-mint"
              href="/admin/relatorios"
            />
            <Kpi
              label="Consumo em aberto"
              value={eur(snapshot.stats.openRevenueCents)}
              hint="Mesas ocupadas, ainda não faturado"
              icon={CircleDollarSign}
              href="/admin/sala"
            />
          </>
        ) : (
          <>
            <Kpi label="Mesas ativas" value={String(snapshot.tables.length - snapshot.stats.available - snapshot.stats.cleaning)} hint="Ocupadas, com pedido ou a aguardar pagamento" icon={Flame} href="/admin/sala" />
            <Kpi label="Pedidos na cozinha" value={String(kitchen.tickets.reduce((sum, t) => sum + t.items.length, 0))} hint={`${kitchen.tickets.length} comandas em preparação`} icon={ChefHat} tone="text-amber" href="/admin/cozinha" />
          </>
        )}
        <Kpi
          label="Pedidos atrasados"
          value={String(lateTickets.length)}
          hint={lateTickets.length ? "Tempo de preparação excedido" : "Todos dentro do tempo alvo"}
          icon={AlertTriangle}
          tone={lateTickets.length ? "text-alert" : "text-mint"}
          href="/admin/cozinha"
        />
        <Kpi
          label="Reservas de hoje"
          value={String(reservations.length)}
          hint={`${reservations.filter((r) => r.status === "pending").length} por confirmar · ${snapshot.stats.guests} pax no salão`}
          icon={CalendarDays}
          href="/admin/reservas"
        />
      </div>

      {user.role === "manager" || user.role === "waiter" ? (
        <FloorWorkspace initialSnapshot={snapshot} catalog={catalog} role={user.role} mode="dashboard" />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Cozinha"
          description="Pedidos com temporizador ativo"
          className="xl:col-span-2"
          action={
            <Link href="/admin/cozinha" className="text-[11px] text-gold-soft hover:underline">
              Abrir KDS
            </Link>
          }
        >
          {kitchen.tickets.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={ChefHat} title="Cozinha em ordem" description="Sem pedidos pendentes neste momento." />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {kitchen.tickets.slice(0, 5).map((ticket) => (
                <li key={ticket.orderId} className="table-row-hover flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-line-strong font-display text-sm text-cream">
                    {ticket.tableCode.replace("T", "")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-cream">
                      #{ticket.orderNumber} · {ticket.items.length} artigos · {ticket.guests} pax
                    </p>
                    <p className="truncate text-[10px] text-muted">
                      {ticket.items.map((i) => `${i.qty}× ${i.name}`).join(" · ")}
                    </p>
                  </div>
                  <span className={cn("chip tnum", ticket.late ? "border-alert/40 text-alert" : "text-muted")}>
                    {ticket.oldestMinutes} min
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Reservas de hoje" action={<Link href="/admin/reservas" className="text-[11px] text-gold-soft hover:underline">Gerir</Link>}>
          {reservations.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted">Sem reservas para hoje.</p>
          ) : (
            <ul className="divide-y divide-line">
              {reservations.slice(0, 6).map((reservation) => (
                <li key={reservation.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div>
                    <p className="text-xs text-cream tnum">{reservation.time} · {reservation.customerName}</p>
                    <p className="text-[10px] text-muted">
                      {reservation.partySize} pax · {reservation.tableCode ?? "sem mesa"}
                    </p>
                  </div>
                  <ReservationStatusBadge status={reservation.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Alertas de stock"
          description="Abaixo do nível de reposição"
          action={<Link href="/admin/inventario" className="text-[11px] text-gold-soft hover:underline">Inventário</Link>}
        >
          {lowStock.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted">Todos os ingredientes acima do nível de reposição.</p>
          ) : (
            <ul className="divide-y divide-line">
              {lowStock.slice(0, 5).map((ingredient) => (
                <li key={ingredient.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <span className="text-xs text-cream">{ingredient.name}</span>
                  <span className="text-[10px] text-alert tnum">
                    {ingredient.stockQty} {ingredient.unit} / mín. {ingredient.reorderLevel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Mesas por estado" description="Sincronizado com o salão">
          <div className="space-y-2 px-4 py-3">
            {(["available", "reserved", "occupied", "order_pending", "awaiting_payment", "cleaning"] as const).map((status) => {
              const count = snapshot.tables.filter((t) => t.status === status).length;
              return (
                <div key={status} className="flex items-center justify-between gap-2">
                  <TableStatusBadge status={status} size="sm" />
                  <div className="flex flex-1 items-center gap-2 pl-2">
                    <div className="meter flex-1">
                      <span style={{ width: `${(count / snapshot.tables.length) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-[11px] text-cream tnum">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Equipa em serviço" description="Sessões e responsabilidades">
          <ul className="divide-y divide-line">
            {Array.from(new Set(snapshot.tables.map((t) => t.order?.waiterName).filter(Boolean))).map((name) => {
              const tables = snapshot.tables.filter((t) => t.order?.waiterName === name);
              return (
                <li key={name} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <UsersRound className="size-3.5 text-muted" aria-hidden />
                    <span className="text-xs text-cream">{name}</span>
                  </div>
                  <span className="text-[10px] text-muted tnum">{tables.length} mesas · {formatTime(tables[0]?.order?.openedAt ?? null)}</span>
                </li>
              );
            })}
            {snapshot.tables.every((t) => !t.order) && <li className="px-4 py-6 text-xs text-muted">Sem comandas abertas.</li>}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
