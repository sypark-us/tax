import { r } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';

/** Tax from the rate schedule, unrounded. */
export const rateScheduleTax = (taxable: number, fs: FilingStatus, p: TaxParams): number => {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of p.brackets[paramStatus(fs)]) {
    const upper = upTo ?? Infinity;
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
};

/**
 * Tax Table interval midpoint. The IRS Tax Table (taxable income under
 * $100,000) charges the rate-schedule tax at the midpoint of the row, so
 * commercial software and the engine agree to the dollar.
 */
const tableMidpoint = (t: number): number => {
  if (t < 5) return 0;
  if (t < 15) return 10;
  if (t < 25) return 20;
  if (t < 3000) {
    const lo = Math.floor(t / 25) * 25;
    return lo + 12.5;
  }
  const lo = Math.floor(t / 50) * 50;
  return lo + 25;
};

/** Form 1040 line 16 ordinary tax: Tax Table under $100,000, otherwise Tax Computation Worksheet. */
export const ordinaryTax = (taxable: number, fs: FilingStatus, p: TaxParams): number => {
  if (taxable <= 0) return 0;
  if (taxable < 100_000) {
    const mid = tableMidpoint(taxable);
    return mid === 0 ? 0 : r(rateScheduleTax(mid, fs, p));
  }
  return r(rateScheduleTax(taxable, fs, p));
};

export const marginalRate = (taxable: number, fs: FilingStatus, p: TaxParams): number => {
  let lower = 0;
  for (const { upTo, rate } of p.brackets[paramStatus(fs)]) {
    if (upTo === null || taxable <= upTo) return rate;
    lower = upTo;
  }
  void lower;
  return 0.37;
};
