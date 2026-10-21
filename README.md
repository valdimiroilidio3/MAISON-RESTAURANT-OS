# MAISON® — Restaurant OS

Sistema completo de operação para um restaurante: site público cinematográfico, sala de jantar 3D
interativa, gestão de sala/comandas, Kitchen Display System, menu e inventário com baixa de stock por
receita, reservas com prevenção de conflitos, relatórios financeiros e exportação CSV — tudo em
Next.js 16 (App Router), TypeScript, Tailwind CSS 4 e React Three Fiber.

> **Demonstração local.** Os pagamentos são registados e confirmados manualmente por um gestor
> (estado `recorded` → `confirmed`). Não existe integração com terminais de pagamento, nem dados de
> cartão são guardados. As figuras humanas em 3D são **estilizadas**, construídas com primitivas e
> animadas proceduralmente — não são modelos fotorrealistas.

---

## Arranque rápido

```bash
npm install
npm run dev          # http://localhost:3000
```

A base de dados SQLite (`data/maison.db`) é criada e populada automaticamente no primeiro acesso,
com 20 mesas em 3 zonas, 21 produtos, 22 ingredientes, 12 reservas, 5 utilizadores e comandas em
todos os estados operacionais. Para recomeçar do zero basta apagar `data/maison.db` (ou definir
`MAISON_DB_PATH`).

### Credenciais de demonstração

| Papel       | Email                | Password      |
| ----------- | -------------------- | ------------- |
| Gestor      | `manager@maison.pt`  | `Maison!2026` |
| Sala        | `waiter@maison.pt`   | `Maison!2026` |
| Cozinha     | `chef@maison.pt`     | `Maison!2026` |
| Sala (extra)| `rui@maison.pt`      | `Maison!2026` |
| Cozinha (extra) | `marta@maison.pt`| `Maison!2026` |

### Scripts

```bash
npm run dev        # servidor de desenvolvimento
npm run build      # build de produção
npm start          # servir o build
npm run typecheck  # tsc --noEmit
npm test           # vitest (63 testes)
```

### Variáveis de ambiente

| Variável               | Pré-definição          | Uso                                            |
| ---------------------- | ---------------------- | ---------------------------------------------- |
| `MAISON_DB_PATH`       | `./data/maison.db`     | Localização do ficheiro SQLite                 |
| `NEXT_PUBLIC_SITE_URL` | `https://maison.example` | Domínio canónico em `sitemap.xml` / `robots.txt` |

---

## O que está implementado

### Site público (`/`)

- Hero cinematográfico com imagem própria, tipografia editorial (Fraunces) e UI sans (Inter).
- Pratos assinatura, grelha editorial, pré-visualização 3D da sala (montada só quando visível,
  com fallback 2D), eventos, história, contactos, footer com horários vindos da base de dados.
- `/menu` — pesquisa em tempo real, filtro por categoria, **exclusão de alergénios**, preços lidos
  da tabela `products` (fonte única de verdade).
- `/reservas` — disponibilidade real por data e número de pessoas (`/api/availability`), 14 dias de
  atalhos, formulário com consentimento, criação via API pública com anti-spam (honeypot) e
  confirmação com código de reserva. Indica explicitamente que o demo não envia email.
- `/salon`, `/historia`, `/experiencias`, `/contactos`, `not-found`, `error`, `sitemap.xml`,
  `robots.txt`.

### Sala 3D (React Three Fiber)

- Salão completo: chão e paredes texturados por procedimento, balcão, garrafeira, cozinha aberta,
  candeeiros, apliques, plantas e **convidados humanos estilizados** (sentados, de pé, empregados a
  circular) animados por código — falar, comer, beber, ler a carta, servir.
- Duas câmaras: órbita livre e vista de topo; seleção de mesa com anel de estado + painel de detalhe,
  hover, filtro por zona (esbate as restantes), legenda de estados, ecrã completo.
- **Desempenho**: qualidade adaptativa (três níveis escolhidos por `hardwareConcurrency`,
  `deviceMemory`, ecrã pequeno e `saveData`), instancing de cadeiras, pernas e talheres, culling de
  convidados e animações em qualidade baixa, orçamento de luzes fixo (as luzes decorativas são
  emissivas; nunca há uma luz por mesa), texturas geradas localmente sem pedidos de rede,
  `Suspense` com skeleton, fallback quando WebGL não está disponível e planta 2D sempre
  disponível — **a operação funciona sem 3D**.
- Acessibilidade: `prefers-reduced-motion` desliga animações e o modo operacional tem alternativa 2D.

### Operação (`/admin`)

| Área              | Funcionalidades                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Painel**        | Indicadores do dia (receita confirmada, mesas ocupadas, comandas abertas, tempo médio), atalhos e estado da sala.                                                |
| **Sala**          | Mapa 3D + planta 2D, abrir comanda, adicionar artigos (carta única), modificadores/notas, enviar para cozinha, acompanhar estados, aplicar desconto, cobrar parcial/total, fechar, libertar mesa. |
| **Cozinha (KDS)** | Tickets por coluna (novos / em preparação / prontos), tempos e cores de alerta, avanço de estado por artigo, atualização automática.                            |
| **Menu**          | CRUD de produtos e categorias, preço, IVA, disponibilidade, destaque, alergénios, imagem.                                                                       |
| **Inventário**    | Ingredientes, stock atual/mínimo, custo, movimentos (entrada/saída/ajuste), receitas produto↔ingrediente com baixa automática ao enviar a comanda e reversão ao anular. |
| **Reservas**      | Lista por dia, confirmação, cancelamento, atribuição de mesa, criação interna com deteção de conflitos.                                                         |
| **Relatórios**    | Receita bruta/confirmada, IVA, serviço, descontos, ticket médio, ocupação, tempos de preparação e serviço, vendas por dia/método/categoria/produto e **exportação CSV**. |
| **Configurações** | Nome, tagline, contactos, horários, IVA, serviço e preços com/sem IVA (apenas gestor).                                                                          |

### Segurança e integridade

- Sessões em base de dados com cookie `httpOnly`, `sameSite=lax`, `secure` em produção; passwords com
  `scrypt` + salt por utilizador.
- Autorização **no servidor** em todas as server actions e rotas API (`manager`, `waiter`, `chef`),
  incluindo leitura de relatórios e exportação CSV.
- Registo de auditoria (`audit_log`) para operações sensíveis: login, envio de comanda, pagamentos,
  fecho, alterações de menu/inventário/reservas/configurações.
- Transações SQLite para comandas, pagamentos e fecho; envio de comanda idempotente (segunda tentativa
  devolve `409` sem duplicar artigos); pagamentos com chave de idempotência; validação Zod em todas as
  entradas; rate limiting nas rotas públicas de reservas.
- Preços e totais calculados **só** no servidor a partir da tabela `products`; o cliente nunca envia
  preços. IVA e taxa de serviço conforme as configurações.

### Estados (fonte única em `src/lib/status.ts`)

- Mesa: `available → reserved → occupied → order_pending → awaiting_payment → cleaning → available`.
- Comanda: `draft → sent → preparing → ready → served → paid` (+ `cancelled`).
- Artigo: `pending → sent → preparing → ready → served` (+ `voided`).
- Pagamento: `recorded → confirmed` (confirmado só por gestor) e `refunded` no cancelamento.

---

## Arquitetura

```
src/
  app/
    (site)/            site público (rotas estáticas ou force-dynamic conforme o caso)
    admin/             8 áreas de operação, protegidas por papel no servidor
    api/               floor, kitchen, orders/**, payments/**, tables/**, reservations,
                       availability, reports/export
    actions/           server actions (auth, menu, inventory, reservations, settings)
    login/             autenticação
  components/
    three/             cena 3D: Room, Furniture, People, materials, room-types
    dining/            Canvas3D, DiningRoomExplorer, FloorPlan2D, FloorWorkspace, use-quality
    admin/             AdminShell, KitchenBoard, MenuManager, InventoryBoard, ReservationsBoard…
    public/            SiteHeader, SiteFooter, MenuExplorer, ReservationFlow
    ui/                Logo, StatusBadge, Modal, Toast, ConfirmSubmit, EmptyState
  lib/                 db, seed, pricing, money, dates, orders, menu, inventory, reservations,
                       reports, auth, audit, api, validation, rate-limit, settings, status…
tests/                 pricing, reservations-rules, orders/flows, layout, cena 3D
```

- **Base de dados**: SQLite (`node:sqlite`), schema e seed idempotentes em `src/lib/db.ts` /
  `src/lib/seed.ts`. WAL, foreign keys ativas, índices nos campos consultados.
- **Fonte única de verdade**: `products` (preços), `restaurant` (IVA/serviço/morada/horários),
  `status.ts` (rótulos e cores de estado). Nenhum preço está duplicado em componentes.
- **Cálculo monetário**: inteiros em cêntimos (`src/lib/money.ts`), IVA extraído com
  `Math.round` e sem floats.

---

## Testes

```bash
npm test
```

63 testes em 6 ficheiros:

- `pricing.test.ts` — subtotais, IVA incluído/adicionado, serviço, descontos, arredondamento, saldo.
- `reservations-rules.test.ts` — datas em Lisboa, capacidade e conflitos por mesa.
- `auth.test.ts` — hashing scrypt, credenciais semeadas, login (sessão + auditoria + cookie
  `httpOnly`), expiração, utilizadores inativos, logout e matriz de papéis.
- `orders.test.ts` — fluxo de comanda, envio idempotente, permissões por papel, stock, pagamentos,
  fecho e auditoria (contra SQLite temporário).
- `layout.test.ts` — 20 mesas semeadas, coordenadas, cadeiras por lugar, mesas sem sobreposição.
- `scene.test.tsx` — a cena 3D renderiza um grupo por mesa, orçamento de luzes fixo, culling de
  convidados em qualidade baixa, estados selecionado/esbatido e modo `prefers-reduced-motion`.

Além dos testes, o fluxo completo foi exercitado por HTTP contra o servidor de desenvolvimento
(`POST /api/orders` → envio → cozinha → servir → pagamento → confirmação do gestor → fecho →
libertação da mesa), incluindo todos os casos de recusa por permissão.

---

## Limitações conhecidas

- **Sem gateway de pagamento.** Os pagamentos são registados e confirmados manualmente; não há captura
  real, nem armazenamento de cartões.
- **Sem envio de email/SMS.** A confirmação de reserva é mostrada no ecrã; a página diz isso ao
  utilizador. Não há fila de notificações.
- **Figuras 3D estilizadas**, não fotorealistas. Não há carregamento de modelos GLTF externos.
- **SQLite local** pensado para demonstração/uma instância. Para produção multi-instância seria
  necessário Postgres (ou Turso) e armazenamento partilhado de sessões.
- **Upload de imagens** é feito por URL/caminho em `public/images`; não há pipeline de upload.
- **Consulta pública da reserva por código** não existe de propósito: os códigos são curtos e não
  devem funcionar como segredo de acesso a dados pessoais.

## Próxima fase sugerida

1. Gateway de pagamento (Stripe Terminal / SIBS) com webhooks idempotentes e reconciliação.
2. Notificações por email/SMS e página de gestão de reserva com token assinado.
3. Multi-restaurante (tenant_id) e migrações versionadas.
4. Impressão de talões/etiquetas e integração com KDS físico.
5. Telemetria de desempenho 3D (FPS, orçamento de draw calls) e orçamentos de custo por prato.
