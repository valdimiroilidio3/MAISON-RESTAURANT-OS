/**
 * Money helpers. All monetary amounts are integer cents. Menu prices are gross
 * (VAT-included by default, matching PT restaurant practice); the pricing module
 * documents exactly how net/tax/service are derived.
 */

export function eur(cents: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function eurCompact(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
    minimumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

/** Parse a user-entered decimal amount ("24,50" or "24.50") into cents. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function formatQty(qty: number): string {
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 3 }).format(qty);
}

export function pct(value: number, digits = 1): string {
  return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: digits }).format(value)}%`;
}
