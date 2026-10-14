import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeReturn } from '../src/engine';
import { parseReturn, type TaxReturn } from '../src/model';

const sample = (): TaxReturn => parseReturn(JSON.parse(readFileSync(new URL('./fixtures/sample-mfj.json', import.meta.url), 'utf8')));

describe('computeReturn on the synthetic MFJ household', () => {
  const c = computeReturn(sample());
  const f = c.f1040;

  it('adds up income', () => {
    expect(f.line1a).toBe(180_000);
    expect(f.line2b).toBe(1_200);
    expect(f.line3b).toBe(4_000);
    // ST +1,000, LT (3,000 - 5,000 + 500) = -1,500, cap gain dist 500 => 0
    expect(c.scheduleD.line16).toBe(0);
    expect(f.line7).toBe(0);
    expect(f.line9).toBe(185_200);
    expect(f.line11).toBe(185_200);
  });

  it('picks the standard deduction when itemized is smaller', () => {
    // SALT 9,500 + 6,000 = 15,500; mortgage 9,000; charity 2,000 => 26,500 < 31,500
    expect(c.scheduleA.line17).toBe(26_500);
    expect(f.line12IsItemized).toBe(false);
    expect(f.line12).toBe(31_500);
    expect(f.line15).toBe(153_700);
  });

  it('computes tax with the QD/CG worksheet and the child tax credit', () => {
    expect(f.line16Method).toBe('qdcg');
    expect(c.qdcg!.line4).toBe(3_000);
    expect(c.schedule8812.qualifyingChildren).toBe(2);
    expect(f.line19).toBe(4_400);
    expect(f.line28).toBe(0);
    expect(f.line24).toBe(f.line22);
  });

  it('nets payments against tax', () => {
    expect(f.line25a).toBe(24_000);
    expect(f.line33).toBe(24_000);
    expect(f.line34 - f.line37).toBe(24_000 - f.line24);
  });

  it('lists the required attachments', () => {
    expect(c.attachments).toEqual(expect.arrayContaining(['Form 1040', 'Schedule B', 'Schedule D', 'Form 8949 (Box A)', 'Form 8949 (Box D)', 'Schedule 8812']));
    expect(c.attachments).not.toContain('Schedule A');
  });
});

describe('year switch', () => {
  it('2026 uses the larger standard deduction and flags unverified parameters', () => {
    const ret = { ...sample(), taxYear: 2026 as const };
    const c = computeReturn(ret);
    expect(c.standardDeduction).toBe(32_200);
    expect(c.f1040.line12).toBe(32_200 + 2_000); // non-itemizer charity deduction
    expect(c.unverifiedParameters.length).toBeGreaterThan(0);
  });

  it('CTC phases out at $50 per $1,000 over $400,000 MFJ', () => {
    const ret = sample();
    ret.w2s[0]!.box1 = 420_000;
    const c = computeReturn(ret);
    expect(c.schedule8812.line9).toBeGreaterThan(0);
    expect(c.schedule8812.line12).toBe(4_400 - c.schedule8812.line9);
  });
});

describe('deduction method', () => {
  const ret = sample();
  it('takes the larger deduction by default', () => {
    const c = computeReturn(ret);
    expect(c.f1040.line12IsItemized).toBe(false);
    expect(c.f1040.line12).toBe(c.standardDeduction);
  });
  it('can be forced to itemize, with a warning when that is smaller', () => {
    const c = computeReturn({ ...ret, deductionMethod: 'itemized' });
    expect(c.f1040.line12IsItemized).toBe(true);
    expect(c.f1040.line12).toBe(c.scheduleA.line17);
    expect(c.attachments).toContain('Schedule A');
    expect(c.warnings.some((w) => w.startsWith('Itemized deductions chosen'))).toBe(true);
  });
  it('honours the older forceStandardDeduction flag', () => {
    const big = { ...ret, itemized: { ...ret.itemized, charityCash: 60_000 } };
    expect(computeReturn(big).f1040.line12IsItemized).toBe(true);
    expect(computeReturn({ ...big, forceStandardDeduction: true }).f1040.line12IsItemized).toBe(false);
    expect(computeReturn({ ...big, deductionMethod: 'standard' }).f1040.line12IsItemized).toBe(false);
  });
});
