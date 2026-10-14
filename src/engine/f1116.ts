/**
 * Form 1116, Foreign Tax Credit, passive category only (interest,
 * dividends, and capital gains not from a trade or business, which covers
 * foreign bank interest, foreign-source fund dividends, and the sale of
 * inherited foreign property).
 *
 * Line numbers follow the 2025 form. Simplifications, each noted where it
 * happens: one category; no definitely related expenses on line 2; gross
 * income from all sources is total income with losses floored at zero;
 * the rate differential adjustment spreads foreign preferential income
 * across the 0%, 15% and 20% rates in the same proportion as the
 * worldwide QD/CG worksheet; no treaty or AMT interaction.
 *
 * The $300/$600 election to skip this form (Schedule 3 line 1 directly)
 * needs every foreign item to be on a 1099 or similar payee statement.
 * Interest from a foreign bank and a property sale are not, so once either
 * exists the form is required.
 */
import { max0, r } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';
import type { QdcgWorksheet } from './qdcg';

/** Form 1116 instructions, line 1a: factors for income taxed at the 15% and 20% rates. */
export const RATE_DIFFERENTIAL = { zero: 0, fifteen: 0.4054, twenty: 0.5405 };
/** Worksheet for Line 18: the complements, applied to worldwide amounts. */
export const LINE18_FACTORS = { zero: 1, fifteen: 0.5946, twenty: 0.4595 };
export const ADJUSTMENT_EXCEPTION_PREFERENTIAL_MAX = 20_000;

export interface F1116Input {
  /** Foreign-source gross amounts in USD. */
  foreignInterest: number;
  foreignOrdinaryDividends: number;
  foreignQualifiedDividends: number;
  /** Net foreign-source long-term capital gain (negative for a loss). */
  foreignLongTermGain: number;
  /** Creditable foreign taxes paid this year, USD. */
  foreignTaxesPaid: number;
  carryoverFromPriorYears: number;
  /** Worldwide figures from the 1040. */
  grossIncomeAllSources: number;
  /** Line 3a: standard deduction, or the medical and property-tax part of Schedule A. */
  line3aDeductions: number;
  /** Line 3b: Schedule 1 adjustments not tied to one income type. */
  line3bDeductions: number;
  mortgageInterest: number;
  taxableIncome: number;
  /** 1040 line 16 plus Schedule 2 line 1z. */
  usTax: number;
  qdcg: QdcgWorksheet | null;
}

export interface Form1116 {
  required: boolean;
  category: 'passive';
  adjustmentRequired: boolean;
  adjustmentExceptionMet: boolean;
  /** Share of worldwide preferential income taxed at each rate. */
  rateShares: { zero: number; fifteen: number; twenty: number };
  foreignGrossIncome: number;
  line1a: number;
  line2: number;
  line3a: number; line3b: number; line3c: number; line3d: number; line3e: number; line3f: number; line3g: number;
  line4a: number; line4b: number;
  line5: number; line6: number; line7: number;
  line8: number; line10: number; line14: number;
  line15: number; line17: number; line18: number; line19: number; line20: number; line21: number; line23: number; line24: number;
  /** Part IV total credit, to Schedule 3 line 1. */
  line35: number;
  /** Foreign tax above the limitation: carry back 1 year, then forward 10 (Schedule B). */
  carryforward: number;
}

const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;

export const form1116 = (inp: F1116Input, fs: FilingStatus, p: TaxParams): Form1116 => {
  const ps = paramStatus(fs);
  const foreignPreferential = inp.foreignQualifiedDividends + max0(inp.foreignLongTermGain);
  const foreignGrossIncome = inp.foreignInterest + inp.foreignOrdinaryDividends + max0(inp.foreignLongTermGain);

  // Adjustment exception (instructions, "Foreign Qualified Dividends and
  // Capital Gains (Losses)"): ordinary taxable income (QD/CG worksheet
  // line 5) at or under the top of the 24% bracket, and foreign
  // preferential income under $20,000.
  const q = inp.qdcg;
  const bracketTop = p.brackets[ps][3]!.upTo!;
  const adjustmentExceptionMet = q === null || (q.line5 <= bracketTop && foreignPreferential < ADJUSTMENT_EXCEPTION_PREFERENTIAL_MAX);
  const adjustmentRequired = q !== null && foreignPreferential > 0 && !adjustmentExceptionMet;

  let rateShares = { zero: 0, fifteen: 1, twenty: 0 };
  if (q && q.line10 > 0) rateShares = { zero: q.line9 / q.line10, fifteen: q.line17 / q.line10, twenty: q.line20 / q.line10 };
  const factor = rateShares.zero * RATE_DIFFERENTIAL.zero + rateShares.fifteen * RATE_DIFFERENTIAL.fifteen + rateShares.twenty * RATE_DIFFERENTIAL.twenty;

  const adjustedPreferential = adjustmentRequired ? r(foreignPreferential * factor) : foreignPreferential;
  const line1a = foreignGrossIncome - foreignPreferential + adjustedPreferential;

  // Worldwide preferential income gets the same treatment on line 3e and line 18.
  let worldwideRemoved = 0;
  if (adjustmentRequired && q) worldwideRemoved = r(q.line9 * LINE18_FACTORS.zero + q.line17 * LINE18_FACTORS.fifteen + q.line20 * LINE18_FACTORS.twenty);

  const line2 = 0;
  const line3a = inp.line3aDeductions;
  const line3b = inp.line3bDeductions;
  const line3c = line3a + line3b;
  const line3d = line1a;
  const line3e = max0(inp.grossIncomeAllSources - worldwideRemoved);
  const line3f = line3e > 0 ? Math.min(1, round4(line3d / line3e)) : 0;
  const line3g = r(line3c * line3f);
  // Mortgage interest: all US-source when foreign gross income is $5,000 or less.
  const line4a = foreignGrossIncome > 5_000 ? r(inp.mortgageInterest * line3f) : 0;
  const line4b = 0;
  const line5 = max0(-inp.foreignLongTermGain);
  const line6 = line2 + line3g + line4a + line4b + line5;
  const line7 = line1a - line6;

  const line8 = r(inp.foreignTaxesPaid);
  const line10 = r(inp.carryoverFromPriorYears);
  const line14 = line8 + line10;

  const line15 = line7;
  const line17 = max0(line15);
  const line18 = max0(inp.taxableIncome - worldwideRemoved);
  const line19 = line18 > 0 ? Math.min(1, round4(line17 / line18)) : 0;
  const line20 = inp.usTax;
  const line21 = r(line20 * line19);
  const line23 = line21;
  const line24 = Math.min(line14, line23);
  const line35 = line24;

  return {
    required: line14 > 0,
    category: 'passive',
    adjustmentRequired,
    adjustmentExceptionMet,
    rateShares,
    foreignGrossIncome,
    line1a, line2,
    line3a, line3b, line3c, line3d, line3e, line3f, line3g,
    line4a, line4b, line5, line6, line7,
    line8, line10, line14,
    line15, line17, line18, line19, line20, line21, line23, line24,
    line35,
    carryforward: max0(line14 - line24),
  };
};
