import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeReturn } from '../src/engine';
import { caTax } from '../src/engine/ca540';
import { parseReturn } from '../src/model';
import { caParamsFor } from '../src/params/ca';

const p25 = caParamsFor(2025);
const base = { taxYear: 2025 as const, taxpayer: { firstName: 'Alex', lastName: 'Kim' } };
const w2 = (box1: number, box17 = 0, extra = {}) => ({ employer: 'Acme', box1, box2: 0, state: 'CA', box16: box1, box17, ...extra });

describe('California tax computation (line 31)', () => {
  it('reproduces 2025 tax table rows at the midpoint of each $100 range', () => {
    // Rows from the FTB 2025 tax table: single / MFJ / HOH.
    expect(caTax(43_100, 'single', p25)).toEqual({ tax: 1_121, method: 'table' });
    expect(caTax(43_051, 'mfj', p25).tax).toBe(640);
    expect(caTax(43_150, 'hoh', p25).tax).toBe(640);
    expect(caTax(50_100, 'single', p25).tax).toBe(1_541);
    expect(caTax(50_051, 'mfj', p25).tax).toBe(780);
    expect(caTax(57_100, 'hoh', p25).tax).toBe(1_012);
    expect(caTax(99_951, 'single', p25).tax).toBe(5_736);
    expect(caTax(100_000, 'mfj', p25).tax).toBe(3_068);
    expect(caTax(100_000, 'hoh', p25).tax).toBe(3_708);
    expect(caTax(13_000, 'single', p25).tax).toBe(149);
    expect(caTax(40, 'single', p25).tax).toBe(0);
    expect(caTax(100, 'single', p25).tax).toBe(1);
  });

  it('uses the rate schedule above $100,000, as in the booklet example', () => {
    expect(caTax(125_000, 'mfj', p25)).toEqual({ tax: 4_768, method: 'schedule' });
    expect(caTax(500_000, 'single', p25).tax).toBe(Math.round(38_638.27 + 0.113 * (500_000 - 445_771)));
  });
});

describe('Form 540', () => {
  it('files automatically for a California W-2 and takes the standard deduction and exemption credit', () => {
    const c = computeReturn(parseReturn({ ...base, filingStatus: 'single', w2s: [w2(80_000, 4_000)] }));
    const s = c.ca!;
    expect(s).not.toBeNull();
    expect(s.line13FederalAgi).toBe(80_000);
    expect(s.line17CaAgi).toBe(80_000);
    expect(s.line18).toBe(5_706);
    expect(s.line19TaxableIncome).toBe(74_294);
    expect(s.line31Tax).toBe(caTax(74_294, 'single', p25).tax);
    expect(s.line32ExemptionCredits).toBe(153);
    expect(s.line64TotalTax).toBe(s.line31Tax - 153);
    expect(s.line71Withholding).toBe(4_000);
    expect(s.line31Tax).toBe(3_349);
    expect(s.line97Overpaid).toBe(4_000 - s.line64TotalTax);
    expect(s.line100TaxDue).toBe(0);
  });

  it('does not file when no W-2 is from California unless asked', () => {
    const ret = { ...base, filingStatus: 'single' as const, w2s: [w2(80_000, 0, { state: 'WA' })] };
    expect(computeReturn(parseReturn(ret)).ca).toBeNull();
    expect(computeReturn(parseReturn({ ...ret, california: { file: 'yes' } })).ca).not.toBeNull();
    expect(computeReturn(parseReturn({ ...ret, w2s: [w2(1)], california: { file: 'no' } })).ca).toBeNull();
  });

  it('adds back the HSA deduction and employer contributions, and exempts Treasury interest', () => {
    const c = computeReturn(parseReturn({
      ...base, filingStatus: 'single',
      w2s: [w2(100_000, 5_000, { box12: [{ code: 'W', amount: 1_500 }] })],
      int1099s: [{ payer: 'Treasury', box1: 0, box3: 2_000 }],
      adjustments: { hsaDeduction: 4_000 },
    }));
    const s = c.ca!;
    expect(c.f1040.line11).toBe(98_000);
    expect(s.scheduleCA.line1hEmployerHsa).toBe(1_500);
    expect(s.scheduleCA.line13HsaDeduction).toBe(4_000);
    expect(s.scheduleCA.line2TreasuryInterest).toBe(2_000);
    expect(s.line14).toBe(6_000);
    expect(s.line16).toBe(1_500);
    expect(s.line17CaAgi).toBe(93_500);
  });

  it('itemizes without the SALT cap, excludes state income tax, and applies the 6%/80% limitation', () => {
    const ret = parseReturn({
      ...base, filingStatus: 'mfj', spouse: {},
      w2s: [w2(600_000, 50_000)],
      itemized: { medical: 0, realEstateTax: 30_000, personalPropertyTax: 2_000, mortgageInterest: 20_000, charityCash: 10_000 },
    });
    const c = computeReturn(ret);
    const s = c.ca!;
    expect(s.scheduleCA.line28Total).toBe(62_000);
    // Federal AGI 600,000 exceeds 504,411 by 95,589; 6% = 5,735 (less than 80% of 62,000).
    expect(s.scheduleCA.itemizedReduction).toBe(5_735);
    expect(s.line18).toBe(56_265);
    expect(s.line18IsItemized).toBe(true);
    // Exemption credits: 2 x 153 reduced by $6 per $2,500 over the threshold (39 steps x 6 = 234 each).
    expect(s.line11).toBe(306);
    expect(s.line32ExemptionCredits).toBe(0);
  });

  it('phases out exemption credits partially and counts dependents', () => {
    const c = computeReturn(parseReturn({
      ...base, filingStatus: 'single', w2s: [w2(260_000, 0)],
      dependents: [{ name: 'Kid', age: 5 }],
    }));
    const s = c.ca!;
    // 7,797 over 252,203 -> 4 steps -> $24 per credit.
    expect(s.line11).toBe(153 + 475);
    expect(s.line32ExemptionCredits).toBe((153 - 24) + (475 - 24));
  });

  it("gives the renter's credit only under the AGI limit", () => {
    const yes = computeReturn(parseReturn({ ...base, filingStatus: 'mfj', spouse: {}, w2s: [w2(100_000)], california: { rentedPrincipalResidence: true } })).ca!;
    expect(yes.line46RenterCredit).toBe(120);
    const no = computeReturn(parseReturn({ ...base, filingStatus: 'mfj', spouse: {}, w2s: [w2(120_000)], california: { rentedPrincipalResidence: true } })).ca!;
    expect(no.line46RenterCredit).toBe(0);
  });

  it('adds the 1% Behavioral Health Services Tax over $1 million', () => {
    const s = computeReturn(parseReturn({ ...base, filingStatus: 'single', w2s: [w2(1_205_706)] })).ca!;
    expect(s.line19TaxableIncome).toBe(1_200_000);
    expect(s.line62BehavioralHealthTax).toBe(2_000);
  });

  it('taxes an inherited property gain as ordinary income and warns about foreign tax', () => {
    const c = computeReturn(parseReturn({ ...base, filingStatus: 'single', w2s: [w2(80_000)], inheritedProperty: [{ description: 'House', dateOfDeath: '2025-01-10', dateSold: '2025-08-01', fmvAtDeath: 500_000, salePrice: 540_000, foreignTaxPaid: 4_000 }] }));
    const s = c.ca!;
    expect(s.line13FederalAgi).toBe(120_000);
    expect(s.line17CaAgi).toBe(120_000);
    expect(s.line31Method).toBe('schedule');
    expect(s.warnings.some((w) => w.includes('no credit for foreign income taxes'))).toBe(true);
  });

  it('uses the 2026 indexed figures', () => {
    const s = computeReturn(parseReturn({ ...base, taxYear: 2026, filingStatus: 'single', w2s: [w2(50_000)] })).ca!;
    expect(s.line18).toBe(5_900);
    expect(s.line32ExemptionCredits).toBe(158);
    expect(s.unverifiedParameters).toContain('exemptionPhaseoutStart');
  });
});

const file = new URL('../data/2025-actual.json', import.meta.url);
describe.skipIf(!existsSync(file))('filed 2025 California return (private)', () => {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const c = computeReturn(parseReturn(raw));
  it('computes a Form 540 for the California household', () => {
    expect(c.ca).not.toBeNull();
    const s = c.ca!;
    const expected = raw.expectedCa as Record<string, number> | undefined;
    if (!expected) {
      console.log(`Form 540 (compare with the filed return): line 17 CA AGI ${s.line17CaAgi}, line 18 ${s.line18}, line 19 ${s.line19TaxableIncome}, line 31 tax ${s.line31Tax}, line 32 ${s.line32ExemptionCredits}, line 64 total ${s.line64TotalTax}, line 71 withheld ${s.line71Withholding}, ${s.line97Overpaid ? 'refund ' + s.line97Overpaid : 'due ' + s.line100TaxDue}`);
      return;
    }
    for (const [k, v] of Object.entries(expected)) expect((s as unknown as Record<string, number>)[k], k).toBe(v);
  });
});
