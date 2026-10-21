import type { OrderItemStatus, OrderStatus, PaymentStatus, ReservationStatus, TableStatus } from "./types";

/** Accessible status metadata: every state has a label, icon key and tone. */
export const TABLE_STATUS_META: Record<
  TableStatus,
  { label: string; short: string; tone: string; dot: string; ring: string; description: string }
> = {
  available: {
    label: "Livre",
    short: "Livre",
    tone: "text-cream border-cream/25 bg-cream/5",
    dot: "#F6F2EA",
    ring: "#F6F2EA",
    description: "Mesa pronta a receber clientes.",
  },
  reserved: {
    label: "Reservada",
    short: "Reserva",
    tone: "text-gold border-gold/35 bg-gold/10",
    dot: "#C6A66B",
    ring: "#C6A66B",
    description: "Reserva atribuída para hoje.",
  },
  occupied: {
    label: "Ocupada",
    short: "Ocupada",
    tone: "text-amber border-amber/35 bg-amber/10",
    dot: "#E8A24B",
    ring: "#E8A24B",
    description: "Clientes na mesa, sem pedidos na cozinha.",
  },
  order_pending: {
    label: "Pedido pendente",
    short: "Pendente",
    tone: "text-mint border-mint/35 bg-mint/10",
    dot: "#62D6A0",
    ring: "#62D6A0",
    description: "Pedido enviado para a cozinha, por servir.",
  },
  awaiting_payment: {
    label: "A aguardar pagamento",
    short: "Pagamento",
    tone: "text-alert border-alert/35 bg-alert/10",
    dot: "#FF625E",
    ring: "#FF625E",
    description: "Pagamento registado, pendente de confirmação de gestão.",
  },
  cleaning: {
    label: "Em limpeza",
    short: "Limpeza",
    tone: "text-slate border-slate/35 bg-slate/10",
    dot: "#98AABB",
    ring: "#93A6BA",
    description: "Mesa a ser preparada para o próximo serviço.",
  },
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  open: "Rascunho",
  sent: "Enviada à cozinha",
  partially_ready: "Parcialmente pronta",
  ready: "Pronta a servir",
  served: "Servida",
  awaiting_payment: "A aguardar pagamento",
  paid: "Paga",
  cancelled: "Anulada",
};

export const ITEM_STATUS_LABEL: Record<OrderItemStatus, string> = {
  draft: "Rascunho",
  sent: "Recebido",
  preparing: "Em preparação",
  ready: "Pronto",
  served: "Servido",
  void: "Anulado",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Por pagar",
  pending: "Parcial",
  recorded: "Registado · por confirmar",
  confirmed: "Confirmado",
  refunded: "Reembolsado",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Numerário",
  card: "Cartão",
  mbway: "MB WAY",
  voucher: "Voucher",
  transfer: "Transferência",
};

export const RESERVATION_STATUS_META: Record<ReservationStatus, { label: string; tone: string; dot: string }> = {
  pending: { label: "Pendente", tone: "text-amber border-amber/35 bg-amber/10", dot: "#E8A24B" },
  confirmed: { label: "Confirmada", tone: "text-gold border-gold/35 bg-gold/10", dot: "#C6A66B" },
  seated: { label: "Sentada", tone: "text-mint border-mint/35 bg-mint/10", dot: "#62D6A0" },
  completed: { label: "Concluída", tone: "text-muted border-line-strong bg-surface-2", dot: "#A39C8F" },
  cancelled: { label: "Cancelada", tone: "text-alert border-alert/35 bg-alert/10", dot: "#FF625E" },
  no_show: { label: "Não compareceu", tone: "text-alert border-alert/30 bg-alert/5", dot: "#FF625E" },
};

export const ROLE_LABEL: Record<string, string> = {
  manager: "Gestão",
  waiter: "Sala",
  chef: "Cozinha",
};

export const ZONE_LABEL: Record<string, string> = {
  esplanada: "Esplanada",
  sala: "Sala",
  balcao: "Balcão",
};
