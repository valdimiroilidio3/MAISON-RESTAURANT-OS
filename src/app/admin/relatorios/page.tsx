import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, CircleDollarSign, Clock3, ReceiptText, UsersRound } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getReports, last7DaysRange, todayRange } from "@/lib/reports";
import { addDaysToDateString } from "@/lib/reservations-rules";
import { localDate } from "@/lib/dates";
import { eur, pct } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "@/lib/status";
import { PageHeader, SectionCard } from "@/components/admin/AdminShell";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatórios" };

function Kpi({ label, value, hint, icon: Icon, tone = "text-cream" }: { label: string; value: string; hint?: string; icon: typeof ReceiptText; tone?: string }) {
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
        <Icon className="size-4 text-muted/70" aria-hidden />
      </div>
      <p className={cn("mt-2 font-display text-2xl tnum", tone)}>{value}</p>
      {hint && <p className="mt-1 text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireRole("manager");
  const params = await searchParams;
  const fallback = last7DaysRange();
  const valid = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
  const from = valid(params.from) ?? fallback.from;
  const to = valid(params.to) ?? fallback.to;
  const report = getReports(user.restaurantId, from, to);

  const maxDay = Math.max(1, ...report.byDay.map((d) => d.grossCents));
  const maxProduct = Math.max(1, ...report.byProduct.slice(0, 8).map((p) => p.grossCents));
  const maxCategory = Math.max(1, ...report.byCategory.map((c) => c.grossCents));
  const quickRanges = [
    { label: "Hoje", from: localDate(0), to: localDate(0) },
    { label: "7 dias", from: localDate(-6), to: localDate(0) },
    { label: "30 dias", from: localDate(-29), to: localDate(0) },
    { label: "Ontem", from: localDate(-1), to: localDate(-1) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finanças"
        title="Relatórios"
        description="Vendas fechadas, impostos, métodos de pagamento e ocupação. Comandas abertas nunca entram na receita recebida."
        actions={
          <a href={`/api/reports/export?from=${from}&to=${to}`} className="btn btn-gold btn-sm">
            <ArrowDownToLine className="size-3.5" aria-hidden /> Exportar CSV
          </a>
        }
      />

      <form action="/admin/relatorios" method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3">
        <div>
          <label className="label" htmlFor="from">
            De
          </label>
          <input id="from" name="from" type="date" defaultValue={from} className="field h-9 w-auto tnum" />
        </div>
        <div>
          <label className="label" htmlFor="to">
            Até
          </label>
          <input id="to" name="to" type="date" defaultValue={to} className="field h-9 w-auto tnum" />
        </div>
        <button type="submit" className="btn btn-primary btn-sm">
          Aplicar
        </button>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {quickRanges.map((range) => (
            <Link
              key={range.label}
              href={`/admin/relatorios?from=${range.from}&to=${range.to}`}
              className={cn(
                "chip transition",
                range.from === from && range.to === to ? "border-gold/60 bg-gold/10 text-gold-soft" : "hover:text-cream",
              )}
            >
              {range.label}
            </Link>
          ))}
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Vendas brutas" value={eur(report.grossSalesCents)} hint={`${report.ordersClosed} comandas pagas · ${report.itemsSold} artigos`} icon={ReceiptText} />
        <Kpi label="Receita confirmada" value={eur(report.confirmedCents)} hint="Pagamentos confirmados em comandas fechadas" icon={CircleDollarSign} tone="text-mint" />
        <Kpi label="Registado por confirmar" value={eur(report.recordedCents)} hint="Aguardam confirmação de gestão" icon={AlertTriangle} tone="text-amber" />
        <Kpi label="Saldo em aberto" value={eur(report.openOrders.balanceCents)} hint={`${report.openOrders.count} comandas abertas — não é receita`} icon={Clock3} tone="text-alert" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Ticket médio" value={eur(report.averageTicketCents)} hint={`${report.guestsServed} pax servidos`} icon={UsersRound} />
        <Kpi label="Vendas líquidas" value={eur(report.netSalesCents)} hint={`IVA contido ${eur(report.taxCents)}`} icon={ReceiptText} />
        <Kpi label="Tempo médio de serviço" value={`${report.averageServiceMinutes} min`} hint={`Preparação média ${report.averagePrepMinutes} min`} icon={Clock3} />
        <Kpi label="Ocupação estimada" value={pct(report.occupancyPercent)} hint={`Base: ${report.range.from} → ${report.range.to}`} icon={UsersRound} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Vendas por dia" description="Total bruto das comandas fechadas" className="xl:col-span-2">
          <div className="flex h-56 items-end gap-2 px-4 pb-4 pt-6">
            {report.byDay.map((day) => (
              <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="text-[9px] text-muted tnum opacity-0 transition group-hover:opacity-100">{eur(day.grossCents)}</span>
                <div
                  className="w-full rounded-t-sm bg-gradient-to-t from-gold/25 to-gold/70 transition group-hover:to-gold"
                  style={{ height: `${Math.max(3, (day.grossCents / maxDay) * 150)}px` }}
                  role="img"
                  aria-label={`${day.date}: ${eur(day.grossCents)}, ${day.orders} comandas`}
                />
                <span className="text-[9px] text-muted tnum">{day.date.slice(8, 10)}/{day.date.slice(5, 7)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-line px-4 py-2 text-[10px] text-muted">
            <span>Descontos concedidos: <span className="text-gold-soft tnum">{eur(report.discountCents)}</span></span>
            <span>Serviço: <span className="text-cream-dim tnum">{eur(report.serviceCents)}</span></span>
            <span>Comandas anuladas: <span className="text-alert tnum">{report.cancelledOrders}</span></span>
          </div>
        </SectionCard>

        <SectionCard title="Métodos de pagamento" description="Confirmado vs registado">
          <ul className="divide-y divide-line">
            {report.byMethod.length === 0 && <li className="px-4 py-6 text-xs text-muted">Sem pagamentos no período.</li>}
            {report.byMethod.map((method) => (
              <li key={method.method} className="px-4 py-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-cream">{PAYMENT_METHOD_LABEL[method.method] ?? method.method}</span>
                  <span className="tnum text-cream">{eur(method.confirmedCents)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                  <span>{method.count} pagamentos</span>
                  <span className={method.recordedCents > 0 ? "text-amber" : "text-muted"}>
                    {method.recordedCents > 0 ? `+ ${eur(method.recordedCents)} por confirmar` : "totalmente confirmado"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-2.5 text-[10px] text-muted">
            Apenas pagamentos confirmados contam como receita.
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Vendas por categoria" description="Bruto, com IVA incluído">
          <ul className="space-y-2 px-4 py-3">
            {report.byCategory.map((category) => (
              <li key={category.name}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-cream-dim">{category.name}</span>
                  <span className="tnum text-muted">{category.qty} un · {eur(category.grossCents)}</span>
                </div>
                <div className="meter mt-1">
                  <span style={{ width: `${(category.grossCents / maxCategory) * 100}%` }} />
                </div>
              </li>
            ))}
            {report.byCategory.length === 0 && <li className="py-4 text-xs text-muted">Sem vendas no período.</li>}
          </ul>
        </SectionCard>

        <SectionCard title="Produtos mais vendidos" description="Top 8 por valor">
          <div className="scroll-x">
            <table className="w-full min-w-[420px] text-left text-[11px]">
              <thead className="border-b border-line text-[9px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 text-right font-medium">Qtd.</th>
                  <th className="px-4 py-2 text-right font-medium">Bruto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {report.byProduct.slice(0, 8).map((product) => (
                  <tr key={product.name} className="table-row-hover">
                    <td className="px-4 py-2 text-cream">{product.name}</td>
                    <td className="px-4 py-2 text-muted">{product.category}</td>
                    <td className="px-4 py-2 text-right text-cream-dim tnum">{product.qty}</td>
                    <td className="px-4 py-2 text-right text-cream tnum">{eur(product.grossCents)}</td>
                  </tr>
                ))}
                {report.byProduct.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted">
                      Sem vendas no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-4 py-2 text-[10px] text-muted">
            Barras: máximo {eur(maxProduct)} no produto líder.
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Definições contabilísticas" description="Como os valores são calculados nesta versão">
        <dl className="grid gap-4 px-4 py-4 text-[11px] sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-cream">Preços do menu</dt>
            <dd className="mt-1 text-muted">
              IVA incluído a 23% (jurisdição PT). O preço mostrado ao cliente é o preço final do artigo.
            </dd>
          </div>
          <div>
            <dt className="text-cream">Vendas brutas</dt>
            <dd className="mt-1 text-muted">
              Total das comandas com estado «paga», com data de fecho no período selecionado.
            </dd>
          </div>
          <div>
            <dt className="text-cream">Vendas líquidas / IVA</dt>
            <dd className="mt-1 text-muted">
              Base tributável e imposto contido no bruto. Não é adicionado IVA sobre IVA.
            </dd>
          </div>
          <div>
            <dt className="text-cream">Receita confirmada</dt>
            <dd className="mt-1 text-muted">
              Soma de pagamentos com estado «confirmado». Registos pendentes e comandas abertas são apresentados à parte.
            </dd>
          </div>
        </dl>
        <p className="border-t border-line px-4 py-2.5 text-[10px] text-muted">
          Os valores são operacionais. A validação fiscal (SAF-T, séries certificadas) e a integração com um PSP real
          continuam como dependências externas — ver Configurações.
        </p>
      </SectionCard>
    </div>
  );
}
