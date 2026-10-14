import { describe, expect, it } from 'vitest';
import { computeReturn } from '../src/engine';
import { parseReturn } from '../src/model';

const base = { taxYear: 2025 as const, filingStatus: 'single' as const, taxpayer: { firstName: 'Alex', lastName: 'Kim' } };

describe('1099-MISC', () => {
  it('puts other income and substitute payments on Schedule 1 line 8z and withholding on line 25b', () => {
    const c = computeReturn(parseReturn({ ...base, w2s: [{ employer: 'Acme', box1: 50_000, box2: 5_000 }], misc1099s: [{ payer: 'Broker', box3: 250, box8: 50, box4: 30 }] }));
    expect(c.schedule1.line8z).toBe(300);
    expect(c.schedule1.line5).toBe(0);
    expect(c.schedule1.line10).toBe(300);
    expect(c.f1040.line8).toBe(300);
    expect(c.f1040.line11).toBe(50_300);
    expect(c.f1040.line25b).toBe(30);
    expect(c.warnings.some((w) => w.includes('Schedule E'))).toBe(false);
  });
  it('takes rents and royalties gross on line 5 with a warning', () => {
    const c = computeReturn(parseReturn({ ...base, w2s: [{ employer: 'Acme', box1: 50_000, box2: 5_000 }], misc1099s: [{ payer: 'Publisher', box1: 1_000, box2: 400 }] }));
    expect(c.schedule1.line5).toBe(1_400);
    expect(c.f1040.line11).toBe(51_400);
    expect(c.warnings.some((w) => w.includes('Schedule E'))).toBe(true);
  });
});
