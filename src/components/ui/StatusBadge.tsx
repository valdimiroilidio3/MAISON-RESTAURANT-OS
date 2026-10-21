import { CalendarDays, Check, CreditCard, Flame, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ITEM_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  RESERVATION_STATUS_META,
  TABLE_STATUS_META,
} from "@/lib/status";
import type { OrderItemStatus, OrderStatus, PaymentStatus, ReservationStatus, TableStatus } from "@/lib/types";

const TABLE_ICON: Record<TableStatus, typeof Check> = {
  available: Check,
  reserved: CalendarDays,
  occupied: Users,
  order_pending: Flame,
  awaiting_payment: CreditCard,
  cleaning: Sparkles,
};

export function TableStatusBadge({
  status,
  size = "md",
  className,
}: {
  status: TableStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = TABLE_STATUS_META[status];
  const Icon = TABLE_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        meta.tone,
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        className,
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={2.2} />
      {meta.label}
    </span>
  );
}

export function StatusDot({ status }: { status: TableStatus }) {
  const meta = TABLE_STATUS_META[status];
  return (
    <span
      className="status-dot"
      style={{ backgroundColor: meta.dot }}
      role="img"
      aria-label={meta.label}
      title={meta.label}
    />
  );
}

const ITEM_TONE: Record<OrderItemStatus, string> = {
  draft: "text-muted border-line-strong bg-surface-3",
  sent: "text-cream border-line-strong bg-surface-3",
  preparing: "text-amber border-amber/30 bg-amber/10",
  ready: "text-mint border-mint/30 bg-mint/10",
  served: "text-muted border-line-strong bg-surface-2",
  void: "text-alert border-alert/30 bg-alert/5 line-through",
};

export function ItemStatusBadge({ status }: { status: OrderItemStatus }) {
  return <span className={cn("chip", ITEM_TONE[status])}>{ITEM_STATUS_LABEL[status]}</span>;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === "paid"
      ? "text-mint border-mint/30 bg-mint/10"
      : status === "cancelled"
        ? "text-alert border-alert/30 bg-alert/5"
        : status === "awaiting_payment"
          ? "text-alert border-alert/25 bg-alert/5"
          : "text-cream-dim border-line-strong bg-surface-2";
  return <span className={cn("chip", tone)}>{ORDER_STATUS_LABEL[status]}</span>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const tone =
    status === "confirmed"
      ? "text-mint border-mint/30 bg-mint/10"
      : status === "recorded"
        ? "text-amber border-amber/30 bg-amber/10"
        : status === "refunded"
          ? "text-alert border-alert/30 bg-alert/5"
          : "text-muted border-line-strong bg-surface-2";
  return <span className={cn("chip", tone)}>{PAYMENT_STATUS_LABEL[status]}</span>;
}

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const meta = RESERVATION_STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", meta.tone)}>
      <span className="status-dot" style={{ backgroundColor: meta.dot }} aria-hidden />
      {meta.label}
    </span>
  );
}
