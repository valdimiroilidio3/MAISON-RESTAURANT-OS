import type { Metadata } from "next";
import { CheckCircle2, KeyRound, Landmark, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { requireRole, getRestaurant } from "@/lib/auth";
import { staffOverview } from "@/lib/settings";
import { listAudit } from "@/lib/reports";
import { formatDateTime } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/status";
import { PageHeader, SectionCard } from "@/components/admin/AdminShell";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações" };

const AUDIT_LABEL: Record<string, string> = {
  "auth.login": "Início de sessão",
  "auth.logout": "Fim de sessão",
  "order.open": "Comanda aberta",
  "order.close": "Comanda fechada",
  "order.cancel": "Comanda anulada",
  "order.send": "Pedido enviado",
  "order.discount": "Desconto",
  "order_item.void": "Artigo anulado",
  "payment.record": "Pagamento registado",
  "payment.confirm": "Pagamento confirmado",
  "product.create": "Produto criado",
  "product.update": "Produto editado",
  "product.availability": "Disponibilidade",
  "product.recipe": "Receita atualizada",
  "category.create": "Categoria criada",
  "stock.adjust": "Movimento de stock",
  "ingredient.create": "Ingrediente criado",
  "ingredient.update": "Ingrediente editado",
  "reservation.create": "Reserva criada",
  "reservation.status": "Estado de reserva",
  "reservation.assign": "Mesa atribuída",
  "table.release": "Mesa libertada",
  "table.cleaning": "Mesa em limpeza",
  "settings.update": "Configuração fiscal",
  "settings.contact": "Contactos",
};

export default async function SettingsPage() {
  const user = await requireRole("manager");
  const restaurant = getRestaurant(user.restaurantId);
  const staff = staffOverview(user.restaurantId);
  const audit = listAudit(user.restaurantId, 40);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Sistema"
        title="Configurações e auditoria"
        description="Identidade, horários, fiscalidade e registo imutável de ações. As alterações são auditadas com autor e data."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Restaurante e fiscalidade" description="Aplica-se a novas comandas e ao website" className="xl:col-span-2">
          <SettingsForm restaurant={restaurant} />
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Segurança" description="Estado da implementação">
            <ul className="divide-y divide-line text-[11px]">
              {[
                { ok: true, title: "Sessões HttpOnly", detail: "Cookie assinado, SameSite=Lax, expiração 10 h" },
                { ok: true, title: "Palavras-passe com scrypt", detail: "Salt individual; nunca em texto simples" },
                { ok: true, title: "Autorização por papel no servidor", detail: "Ações e APIs validam o papel" },
                { ok: true, title: "Isolamento por restaurante", detail: "Todas as queries filtram restaurant_id" },
                { ok: true, title: "Audit log", detail: "Comandas, produtos, stock, pagamentos e sessões" },
                { ok: true, title: "Transações e idempotência", detail: "Comandas e pagamentos protegidos" },
                { ok: false, title: "Pagamentos reais", detail: "Requer PSP licenciado — não implementado" },
              ].map((item) => (
                <li key={item.title} className="flex items-start gap-2 px-4 py-2.5">
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-mint" aria-hidden />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber" aria-hidden />
                  )}
                  <div>
                    <p className="text-cream-dim">{item.title}</p>
                    <p className="text-[10px] text-muted">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Integrações externas" description="Dependências para produção">
            <ul className="space-y-2 px-4 py-3 text-[11px]">
              <li className="flex items-start gap-2">
                <KeyRound className="mt-0.5 size-3.5 text-muted" aria-hidden />
                <span className="text-muted">Autenticação SSO / IdP corporativo — não configurado.</span>
              </li>
              <li className="flex items-start gap-2">
                <Landmark className="mt-0.5 size-3.5 text-muted" aria-hidden />
                <span className="text-muted">PSP (Stripe/SIBS) e faturação certificada — não configurados.</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 text-muted" aria-hidden />
                <span className="text-muted">Notificações por email/SMS — não configuradas; reservas ficam pendentes.</span>
              </li>
            </ul>
            <p className="border-t border-line px-4 py-2.5 text-[10px] text-muted">
              Nenhuma chave privada é exposta ao browser. Este ambiente demonstra o produto sem integrações pagas.
            </p>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Equipa" description="Utilizadores com acesso ao painel">
        <div className="scroll-x">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Papel</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {staff.map((person) => (
                <tr key={person.id} className="table-row-hover">
                  <td className="px-4 py-2.5 text-cream">{person.name}</td>
                  <td className="px-4 py-2.5 text-muted">{person.email}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("chip", person.role === "manager" ? "border-gold/40 text-gold-soft" : "text-muted")}>
                      {ROLE_LABEL[person.role]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-mint">{person.active ? "Ativo" : "Inativo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-[10px] text-muted">
          <Users className="size-3" aria-hidden />
          A gestão de novos utilizadores é feita por seed/migração nesta versão; a UI de convites é evolução prevista.
        </p>
      </SectionCard>

      <SectionCard title="Audit log" description="Últimas 40 ações registadas no restaurante">
        <div className="scroll-x">
          <table className="w-full min-w-[760px] text-left text-[11px]">
            <thead className="border-b border-line text-[9px] uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Ação</th>
                <th className="px-4 py-2 font-medium">Entidade</th>
                <th className="px-4 py-2 font-medium">Detalhe</th>
                <th className="px-4 py-2 font-medium">Autor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {audit.map((entry) => (
                <tr key={entry.id} className="table-row-hover">
                  <td className="px-4 py-2 text-muted tnum">{formatDateTime(entry.createdAt)}</td>
                  <td className="px-4 py-2 text-cream-dim">{AUDIT_LABEL[entry.action] ?? entry.action}</td>
                  <td className="px-4 py-2 text-muted">
                    {entry.entity} <span className="text-muted/60">#{entry.entityId}</span>
                  </td>
                  <td className="px-4 py-2 text-muted">{entry.detail}</td>
                  <td className="px-4 py-2 text-cream-dim">
                    {entry.actorName ?? "sistema"}
                    {entry.actorRole && <span className="ml-1 text-[9px] text-muted">{ROLE_LABEL[entry.actorRole]}</span>}
                  </td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted">
                    Sem registos de auditoria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
