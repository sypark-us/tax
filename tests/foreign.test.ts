import { describe, expect, it } from 'vitest';
import { computeReturn } from '../src/engine';
import { form1116 } from '../src/engine/f1116';
import { form3520, form8938 } from '../src/engine/foreign';
import { inheritedSale } from '../src/engine/inherited';
import { parseReturn } from '../src/model';
import { paramsFor } from '../src/params';

const p25 = paramsFor(2025);
const base = { taxYear: 2025 as const, taxpayer: { firstName: 'Alex', lastName: 'Kim' } };

describe('inherited property sale', () => {
  it('steps basis up to date-of-death value, converts each amount at its own rate, and lands in Box F', () => {
    const s = inheritedSale(parseReturn({ ...base, filingStatus: 'single', inheritedProperty: [{
      description: 'Apartment, Seoul', country: 'Korea, South', dateOfDeath: '2024-11-02', dateSold: '2025-06-15',
      currency: 'KRW', fmvAtDeath: 1_000_000_000, rateAtDeath: 1400, salePrice: 1_100_000_000, rateAtSale: 1375,
      sellingCosts: 11_000_000, foreignTaxPaid: 13_750_000, rateAtTaxPayment: 1375,
    }] }).inheritedProperty[0]!, 0);
    expect(s.basisUsd).toBe(714_286);
    expect(s.proceedsUsd).toBe(800_000);
    expect(s.sellingCostsUsd).toBe(8_000);
    expect(s.gainUsd).toBe(77_714);
    expect(s.foreignTaxPaidUsd).toBe(10_000);
    expect(s.lot).toMatchObject({ dateAcquired: 'INHERITED', term: 'long', reportedOn1099B: false, adjustmentCode: 'E', adjustment: -8_000 });
  });

  it('flows through Schedule D line 10 and Form 8949 Box F', () => {
    const c = computeReturn(parseReturn({ ...base, filingStatus: 'single', w2s: [{ box1: 80_000, box2: 9_000 }], inheritedProperty: [{
      description: 'House', dateOfDeath: '2025-01-10', dateSold: '2025-08-01', fmvAtDeath: 500_000, salePrice: 540_000, sellingCosts: 20_000,
    }] }));
    expect(c.scheduleD.required).toBe(true);
    expect(c.scheduleD.f8949.map((x) => x.box)).toEqual(['F']);
    expect(c.scheduleD.line10).toBe(20_000);
    expect(c.f1040.line7).toBe(20_000);
    expect(c.f1040.line16Method).toBe('qdcg');
    expect(c.attachments).toEqual(expect.arrayContaining(['Schedule D', 'Form 8949 (Box F)']));
    expect(c.warnings.some((w) => w.includes('IRC 1014'))).toBe(true);
  });
});

describe('Form 3520 Part IV', () => {
  it('is not required at $100,000 and lists only gifts over $5,000 once required', () => {
    const at = form3520(parseReturn({ ...base, filingStatus: 'single', foreignGifts: [{ donorType: 'estate', amount: 100_000 }] }), p25);
    expect(at.required).toBe(false);
    const over = form3520(parseReturn({ ...base, filingStatus: 'single', foreignGifts: [
      { date: '2025-03-01', description: 'Inheritance, father', donorType: 'estate', donorCountry: 'Korea, South', currency: 'KRW', amount: 150_000_000, rate: 1400 },
      { date: '2025-09-01', description: 'Birthday gift, aunt', donorType: 'individual', amount: 4_000 },
    ] }), p25);
    expect(over.required).toBe(true);
    expect(over.line54.total).toBe(111_143);
    expect(over.line54.gifts).toHaveLength(1);
    expect(over.line54.gifts[0]).toMatchObject({ fmvUsd: 107_143, description: 'Inheritance, father' });
    expect(over.line54.noneOver5000).toBe(false);
    expect(over.dueDate).toBe('2026-04-15');
  });

  it('uses the indexed threshold for corporate donors', () => {
    const f = form3520(parseReturn({ ...base, filingStatus: 'single', foreignGifts: [{ donorType: 'corporation', amount: 20_117 }] }), p25);
    expect(f.line55.required).toBe(true);
    expect(f.line54.required).toBe(false);
  });

  it('is listed as a separate filing by the engine', () => {
    const c = computeReturn(parseReturn({ ...base, filingStatus: 'single', foreignGifts: [{ donorType: 'estate', amount: 250_000 }] }));
    expect(c.f3520.required).toBe(true);
    expect(c.separateFilings.some((s) => s.startsWith('Form 3520'))).toBe(true);
    expect(c.attachments).not.toContain('Form 3520');
  });
});

describe('Form 8938', () => {
  const acct = (o: object) => ({ institution: 'Hana', accountNumber: '1', country: 'Korea, South', ...o });
  it('applies the last-day and any-time thresholds by filing status', () => {
    const single = form8938(parseReturn({ ...base, filingStatus: 'single', foreignAccounts: [acct({ maxValue: 60_000, yearEndValue: 40_000 })] }), 'single');
    expect(single.required).toBe(false);
    expect(single.lastDayValue).toBe(40_000);
    expect(single.anyTimeValue).toBe(60_000);
    const assumed = form8938(parseReturn({ ...base, filingStatus: 'single', foreignAccounts: [acct({ maxValue: 60_000 })] }), 'single');
    expect(assumed.required).toBe(true);
    expect(assumed.partV[0]!.yearEndAssumed).toBe(true);
    const mfj = form8938(parseReturn({ ...base, filingStatus: 'mfj', spouse: {}, foreignAccounts: [acct({ maxValue: 60_000 })] }), 'mfj');
    expect(mfj.required).toBe(false);
  });

  it('summarises deposit and custodial accounts and skips signature-only accounts', () => {
    const f = form8938(parseReturn({ ...base, filingStatus: 'single', foreignAccounts: [
      acct({ maxValue: 50_000, closedThisYear: true }),
      acct({ institution: 'Kiwoom', accountType: 'securities', maxValue: 30_000, yearEndValue: 30_000 }),
      acct({ institution: 'Employer', maxValue: 900_000, signatureAuthorityOnly: true }),
    ], int1099s: [{ payer: 'Hana', box1: 700, foreignCountry: 'Korea, South' }] }), 'single');
    expect(f.partI).toEqual({ line5: 1, line6: 50_000, line7: 1, line8: 30_000, line9AnyClosed: true });
    expect(f.partV).toHaveLength(2);
    expect(f.lastDayValue).toBe(30_000);
    expect(f.anyTimeValue).toBe(80_000);
    expect(f.required).toBe(true);
    expect(f.partIII.interest).toBe(700);
  });
});

describe('Form 1116', () => {
  it('limits the credit to the US tax on foreign-source income', () => {
    const f = form1116({
      foreignInterest: 10_000, foreignOrdinaryDividends: 0, foreignQualifiedDividends: 0, foreignLongTermGain: 0,
      foreignTaxesPaid: 1_540, carryoverFromPriorYears: 0,
      grossIncomeAllSources: 110_000, line3aDeductions: 15_750, line3bDeductions: 0, mortgageInterest: 0,
      taxableIncome: 94_250, usTax: 16_000, qdcg: null,
    }, 'single', p25);
    expect(f.line3f).toBe(0.0909);
    expect(f.line3g).toBe(1_432);
    expect(f.line7).toBe(8_568);
    expect(f.line19).toBe(0.0909);
    expect(f.line21).toBe(1_454);
    expect(f.line35).toBe(1_454);
    expect(f.carryforward).toBe(86);
  });

  it('uses the whole foreign tax when the limit is higher, and carries in prior-year credit', () => {
    const f = form1116({
      foreignInterest: 10_000, foreignOrdinaryDividends: 0, foreignQualifiedDividends: 0, foreignLongTermGain: 0,
      foreignTaxesPaid: 500, carryoverFromPriorYears: 300,
      grossIncomeAllSources: 110_000, line3aDeductions: 15_750, line3bDeductions: 0, mortgageInterest: 0,
      taxableIncome: 94_250, usTax: 16_000, qdcg: null,
    }, 'single', p25);
    expect(f.line14).toBe(800);
    expect(f.line35).toBe(800);
    expect(f.carryforward).toBe(0);
  });

  it('applies the rate differential adjustment above the exception thresholds', () => {
    const c = computeReturn(parseReturn({ ...base, filingStatus: 'single', w2s: [{ box1: 150_000, box2: 30_000 }], inheritedProperty: [{
      description: 'House', dateOfDeath: '2025-01-10', dateSold: '2025-08-01', fmvAtDeath: 500_000, salePrice: 600_000, foreignTaxPaid: 15_000,
    }] }));
    const f = c.f1116!;
    expect(f.required).toBe(true);
    expect(f.adjustmentExceptionMet).toBe(false);
    expect(f.adjustmentRequired).toBe(true);
    // All of the gain is in the 15% band, so line 1a is 100,000 x 0.4054.
    expect(f.rateShares.fifteen).toBeCloseTo(1, 6);
    expect(f.line1a).toBe(40_540);
    expect(f.line18).toBe(c.f1040.line15 - Math.round(100_000 * 0.5946));
    expect(f.line21).toBeLessThan(15_000);
    expect(c.schedule3.line1).toBe(f.line35);
    expect(c.schedule3.line1Method).toBe('form1116');
    expect(c.attachments).toContain('Form 1116');
    expect(c.warnings.some((w) => w.includes('rate differential'))).toBe(true);
  });

  it('keeps the direct election for small 1099-DIV foreign tax and drops it when a foreign bank is involved', () => {
    const div = { ...base, filingStatus: 'single' as const, w2s: [{ box1: 80_000, box2: 9_000 }], div1099s: [{ payer: 'Fund', box1a: 2_000, box1b: 2_000, box7: 200, foreignSourceDividends: 2_000 }] };
    const a = computeReturn(parseReturn(div));
    expect(a.f1116).toBeNull();
    expect(a.schedule3.line1).toBe(200);
    expect(a.schedule3.line1Method).toBe('election');
    const b = computeReturn(parseReturn({ ...div, int1099s: [{ payer: 'Hana', box1: 1_000, foreignCountry: 'Korea, South', foreignTaxPaid: 120 }] }));
    expect(b.f1116).not.toBeNull();
    expect(b.f1116!.line8).toBe(320);
    expect(b.schedule3.line1Method).toBe('form1116');
    const forced = computeReturn(parseReturn({ ...div, foreignTaxCreditMethod: 'form1116' }));
    expect(forced.f1116).not.toBeNull();
  });
});
