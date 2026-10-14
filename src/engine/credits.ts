import { max0, pct, r, sum } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';
import type { TaxReturn } from '../model';

export interface Schedule8812 {
  qualifyingChildren: number;
  otherDependents: number;
  line5: number; // total credit before phaseout
  line9: number; // phaseout
  line12: number; // credit after phaseout
  line14: number; // nonrefundable CTC -> 1040 line 19
  line27: number; // additional (refundable) CTC -> 1040 line 28
}

export const schedule8812 = (
  ret: TaxReturn,
  inp: { agi: number; taxLimit: number; earnedIncome: number },
  fs: FilingStatus,
  p: TaxParams,
): Schedule8812 => {
  const ps = paramStatus(fs);
  const kids = ret.dependents.filter((d) => d.qualifyingChild && d.age < 17 && d.hasValidSsn).length;
  const others = ret.dependents.length - kids;
  const line5 = kids * p.ctc.perChild + others * p.ctc.otherDependent;
  const over = max0(inp.agi - p.ctc.phaseoutStart[ps]);
  const line9 = Math.ceil(over / 1000) * 50;
  const line12 = max0(line5 - line9);
  const line14 = Math.min(line12, max0(inp.taxLimit));
  const unused = line12 - line14;
  const refundableCap = kids * p.ctc.refundableMax;
  const earnedBased = pct(max0(inp.earnedIncome - p.ctc.earnedIncomeFloor), p.ctc.refundableRate);
  const line27 = kids === 0 ? 0 : Math.min(unused, refundableCap, earnedBased);
  return { qualifyingChildren: kids, otherDependents: others, line5, line9, line12, line14, line27 };
};

export interface Schedule3 {
  line1: number; // foreign tax credit
  line1Method: 'none' | 'election' | 'form1116';
  line8: number; // total nonrefundable -> 1040 line 20
  line11: number; // excess social security withheld
  line15: number; // total other payments -> 1040 line 31
}

export const schedule3 = (
  ret: TaxReturn,
  inp: { taxBeforeCredits: number; foreignTaxCredit: number; foreignTaxCreditMethod: Schedule3['line1Method'] },
  fs: FilingStatus,
  p: TaxParams,
): Schedule3 => {
  const line1 = Math.min(r(inp.foreignTaxCredit), max0(inp.taxBeforeCredits));
  const line1Method = line1 > 0 ? inp.foreignTaxCreditMethod : 'none';
  const line8 = line1;

  let line11 = 0;
  const maxSs = pct(p.socialSecurityWageBase, 0.062);
  for (const owner of ['taxpayer', 'spouse'] as const) {
    const w2s = ret.w2s.filter((w) => w.owner === owner);
    if (w2s.length < 2) continue;
    line11 += max0(sum(w2s.map((w) => r(w.box4))) - maxSs);
  }
  const line15 = line11 + r(ret.payments.extension);
  return { line1, line1Method, line8, line11, line15 };
};

export interface Form8995 {
  required: boolean;
  needsForm8995A: boolean;
  line2: number; // net QBI from businesses
  line5: number; // 20% of QBI (zero if loss)
  line6: number; // REIT/199A dividends
  line9: number; // 20% of line 6
  line10: number;
  line11: number; // taxable income before QBI
  line12: number; // net capital gain
  line14: number; // 20% x (line 11 - line 12)
  line15: number; // QBI deduction -> 1040 line 13a
  qbiLossCarryforward: number;
}

export const form8995 = (
  ret: TaxReturn,
  inp: { netQbi: number; taxableBeforeQbi: number; netCapitalGain: number },
  fs: FilingStatus,
  p: TaxParams,
): Form8995 => {
  const ps = paramStatus(fs);
  const line2 = inp.netQbi;
  const needsForm8995A = inp.taxableBeforeQbi > p.qbi.threshold[ps] && line2 > 0;
  const line5 = needsForm8995A ? 0 : pct(max0(line2), p.qbi.rate);
  const line6 = sum(ret.div1099s.map((d) => r(d.box5)));
  const line9 = pct(line6, p.qbi.rate);
  const line10 = line5 + line9;
  const line11 = inp.taxableBeforeQbi;
  const line12 = inp.netCapitalGain;
  const line14 = pct(max0(line11 - line12), p.qbi.rate);
  const line15 = Math.min(line10, line14);
  return {
    required: line15 > 0 || line2 < 0,
    needsForm8995A,
    line2, line5, line6, line9, line10, line11, line12, line14, line15,
    qbiLossCarryforward: max0(-line2),
  };
};
