import { describe, expect, it } from "vitest";
import { clampDiscount, computeOrderTotals, lineTotal } from "@/lib/pricing";
import { parseMoneyToCents } from "@/lib/money";

const inclusive = { taxRateBps: 2300, pricesIncludeTax: true, serviceChargeBps: 0 };
const exclusive = { taxRateBps: 2300, pricesIncludeTax: false, serviceChargeBps: 0 };

describe("computeOrderTotals", () => {
  it("extracts VAT from gross menu prices (PT 23% included)", () => {
    const totals = computeOrderTotals({ lines: [{ unitPriceCents: 10_000, qty: 1 }] }, inclusive);
    expect(totals.subtotalCents).toBe(10_000);
    expect(totals.netSalesCents).toBe(8_130);
    expect(totals.taxCents).toBe(1_870);
    expect(totals.totalCents).toBe(10_000);
  });

  it("adds VAT on top when prices exclude tax", () => {
    const totals = computeOrderTotals({ lines: [{ unitPriceCents: 10_000, qty: 1 }] }, exclusive);
    expect(totals.netSalesCents).toBe(10_000);
    expect(totals.taxCents).toBe(2_300);
    expect(totals.totalCents).toBe(12_300);
  });

  it("applies discounts on the gross subtotal and never below zero", () => {
    const totals = computeOrderTotals({ lines: [{ unitPriceCents: 2_000, qty: 2 }], discountCents: 5_000 }, inclusive);
    expect(totals.subtotalCents).toBe(4_000);
    expect(totals.discountCents).toBe(4_000);
    expect(totals.totalCents).toBe(0);
  });

  it("computes service charge on net sales, untaxed", () => {
    const totals = computeOrderTotals(
      { lines: [{ unitPriceCents: 10_000, qty: 1 }] },
      { taxRateBps: 2300, pricesIncludeTax: true, serviceChargeBps: 500 },
    );
    expect(totals.serviceCents).toBe(407); // 5% of 8130
    expect(totals.totalCents).toBe(10_407);
  });

  it("multiplies quantities and ignores invalid quantity/price signs", () => {
    const totals = computeOrderTotals(
      {
        lines: [
          { unitPriceCents: 1_650, qty: 3 },
          { unitPriceCents: -500, qty: 2 },
        ],
      },
      inclusive,
    );
    expect(totals.subtotalCents).toBe(4_950);
  });
});

describe("helpers", () => {
  it("clamps discounts", () => {
    expect(clampDiscount(9_999, 1_000)).toBe(1_000);
    expect(clampDiscount(-10, 1_000)).toBe(0);
  });

  it("adds modifiers per unit", () => {
    expect(lineTotal(1_000, 2, [{ priceDeltaCents: 250 }])).toBe(2_500);
  });

  it("parses pt-PT money input", () => {
    expect(parseMoneyToCents("24,50")).toBe(2_450);
    expect(parseMoneyToCents("24.5")).toBe(2_450);
    expect(parseMoneyToCents("1.234,50")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
  });
});
