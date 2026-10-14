import { describe, expect, it } from 'vitest';
import { ordinaryTax, rateScheduleTax } from '../src/engine/brackets';
import { paramsFor } from '../src/params';

const p25 = paramsFor(2025);
const p26 = paramsFor(2026);

describe('ordinary tax', () => {
  it('uses the rate schedule at or above $100,000 (2025 MFJ)', () => {
    // 2,385 + 8,772 + 24,145 + (374,604 - 206,700) x 24% = 75,598.96
    expect(ordinaryTax(374_604, 'mfj', p25)).toBe(75_599);
  });

  it('uses the tax-table midpoint under $100,000', () => {
    // single 2025, row 50,000-50,050, midpoint 50,025
    const mid = rateScheduleTax(50_025, 'single', p25);
    expect(ordinaryTax(50_000, 'single', p25)).toBe(Math.round(mid));
    expect(ordinaryTax(50_049, 'single', p25)).toBe(Math.round(mid));
  });

  it('is zero at or below zero and for the first table row', () => {
    expect(ordinaryTax(0, 'single', p25)).toBe(0);
    expect(ordinaryTax(-5, 'single', p25)).toBe(0);
    expect(ordinaryTax(4, 'single', p25)).toBe(0);
  });

  it('is monotonic non-decreasing in taxable income', () => {
    for (const fs of ['single', 'mfj', 'mfs', 'hoh'] as const) {
      let prev = 0;
      for (let t = 0; t <= 1_000_000; t += 137) {
        const tax = ordinaryTax(t, fs, p26);
        expect(tax).toBeGreaterThanOrEqual(prev);
        prev = tax;
      }
    }
  });

  it('2026 MFJ top of 24% bracket', () => {
    // 2,480 + 9,120 + 24,332 + 46,116 = 82,048
    expect(ordinaryTax(403_550, 'mfj', p26)).toBe(82_048);
  });
});
