/**
 * Pricing rules for orders.
 *
 * Definitions (explicit, also surfaced in the admin reports UI):
 * - Menu prices are GROSS when `pricesIncludeTax` is true (default for PT: VAT 23% included).
 * - subtotal   = sum(unit price × qty) of non-void items, gross.
 * - discount   = manager-approved discount, applied on the gross subtotal.
 * - net sales  = gross after discount minus the VAT contained in it.
 * - VAT        = contained tax (inclusive mode) or added tax (exclusive mode).
 * - service    = configured service charge, computed on net sales, not taxed.
 * - total      = gross after discount + service (inclusive) or net + VAT + service (exclusive).
 *
 * Rounding is half-up on integer cents at each boundary. There is no floating
 * point money arithmetic beyond this module.
 */

export interface PricingConfig {
  taxRateBps: number;
  pricesIncludeTax: boolean;
  serviceChargeBps: number;
}

export interface PricingLine {
  unitPriceCents: number;
  qty: number;
}

export interface OrderTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  netSalesCents: number;
  serviceCents: number;
  totalCents: number;
}

export function clampDiscount(discountCents: number, subtotalCents: number): number {
  if (!Number.isFinite(discountCents) || discountCents <= 0) return 0;
  return Math.min(Math.round(discountCents), Math.max(0, subtotalCents));
}

export function computeOrderTotals(
  input: { lines: PricingLine[]; discountCents?: number },
  config: PricingConfig,
): OrderTotals {
  const subtotalCents = input.lines.reduce((sum, line) => {
    const price = Math.max(0, Math.round(line.unitPriceCents));
    const qty = Math.max(0, Math.trunc(line.qty));
    return sum + price * qty;
  }, 0);

  const discountCents = clampDiscount(input.discountCents ?? 0, subtotalCents);
  const grossAfterDiscount = subtotalCents - discountCents;
  const rate = Math.max(0, config.taxRateBps) / 10_000;

  const netSalesCents = config.pricesIncludeTax
    ? Math.round(grossAfterDiscount / (1 + rate))
    : grossAfterDiscount;
  const taxCents = config.pricesIncludeTax
    ? grossAfterDiscount - netSalesCents
    : Math.round(grossAfterDiscount * rate);

  const serviceCents = Math.round((netSalesCents * Math.max(0, config.serviceChargeBps)) / 10_000);

  const totalCents = config.pricesIncludeTax
    ? grossAfterDiscount + serviceCents
    : grossAfterDiscount + taxCents + serviceCents;

  return {
    subtotalCents,
    discountCents,
    taxCents,
    netSalesCents,
    serviceCents,
    totalCents,
  };
}

export function lineTotal(unitPriceCents: number, qty: number, modifiers: { priceDeltaCents: number }[] = []): number {
  const modifierTotal = modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
  return (unitPriceCents + modifierTotal) * qty;
}
