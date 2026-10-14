import { max0, pct, r, sum } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';
import type { TaxReturn } from '../model';

export interface ScheduleSE {
  owner: 'taxpayer' | 'spouse';
  netProfit: number;
  line4a: number; // net earnings x 0.9235
  ssTaxable: number;
  socialSecurityTax: number;
  medicareTax: number;
  line12: number; // total SE tax
  line13: number; // deductible half
}

/** Schedule C line 31 net profit or loss, summed over businesses, optionally for one owner. */
export const netScheduleC = (ret: TaxReturn, owner?: 'taxpayer' | 'spouse'): number =>
  sum(
    ret.scheduleC
      .filter((c) => owner === undefined || c.owner === owner)
      .map((c) => r(c.grossReceipts) - r(c.returnsAndAllowances) - r(c.costOfGoodsSold) - r(c.expenses)),
  );

/** Schedule SE per owner; returns empty array when no SE tax is due. */
export const scheduleSE = (ret: TaxReturn, p: TaxParams): ScheduleSE[] => {
  const out: ScheduleSE[] = [];
  for (const owner of ['taxpayer', 'spouse'] as const) {
    const netProfit = netScheduleC(ret, owner);
    const line4a = pct(netProfit, p.seTax.netEarningsFactor);
    if (line4a < p.seTax.minimum) continue;
    const ssWages = sum(ret.w2s.filter((w) => w.owner === owner).map((w) => r(w.box3)));
    const ssTaxable = max0(Math.min(line4a, p.socialSecurityWageBase - ssWages));
    const socialSecurityTax = pct(ssTaxable, p.seTax.ssRate);
    const medicareTax = pct(line4a, p.seTax.medicareRate);
    const line12 = socialSecurityTax + medicareTax;
    out.push({ owner, netProfit, line4a, ssTaxable, socialSecurityTax, medicareTax, line12, line13: r(line12 / 2) });
  }
  return out;
};

export interface Form8959 {
  required: boolean;
  line1: number; // Medicare wages (W-2 box 5)
  line5: number; // threshold
  line6: number; // excess
  line7: number; // additional Medicare tax on wages
  line8: number; // SE income subject
  line13: number; // tax on SE income
  line18: number; // total additional Medicare tax -> Schedule 2 line 11
  line19: number; // Medicare tax withheld (box 6)
  line20: number; // regular Medicare on box 5
  line22: number; // additional withholding -> 1040 line 25c
  line24: number;
}

export const form8959 = (ret: TaxReturn, se: ScheduleSE[], fs: FilingStatus, p: TaxParams): Form8959 => {
  const ps = paramStatus(fs);
  const line1 = sum(ret.w2s.map((w) => r(w.box5)));
  const line5 = p.additionalMedicare.threshold[ps];
  const line6 = max0(line1 - line5);
  const line7 = pct(line6, p.additionalMedicare.rate);
  const line8 = sum(se.map((s) => s.line4a));
  const seThreshold = max0(line5 - line1);
  const line13 = pct(max0(line8 - seThreshold), p.additionalMedicare.rate);
  const line18 = line7 + line13;
  const line19 = sum(ret.w2s.map((w) => r(w.box6)));
  const line20 = pct(line1, 0.0145);
  const line22 = max0(line19 - line20);
  const line24 = line22;
  const required = line18 > 0 || line22 > 0;
  return { required, line1, line5, line6, line7, line8, line13, line18, line19, line20, line22, line24 };
};

export interface Form8960 {
  required: boolean;
  line1: number; line2: number; line5a: number; line8: number;
  line12: number; line13: number; line14: number; line15: number; line16: number; line17: number;
}

export const form8960 = (
  inp: { taxableInterest: number; ordinaryDividends: number; netGain: number; magi: number },
  fs: FilingStatus,
  p: TaxParams,
): Form8960 => {
  const ps = paramStatus(fs);
  const line1 = inp.taxableInterest;
  const line2 = inp.ordinaryDividends;
  const line5a = inp.netGain;
  const line8 = line1 + line2 + line5a;
  const line12 = max0(line8);
  const line13 = inp.magi;
  const line14 = p.niit.threshold[ps];
  const line15 = max0(line13 - line14);
  const line16 = Math.min(line12, line15);
  const line17 = pct(line16, p.niit.rate);
  return { required: line17 > 0, line1, line2, line5a, line8, line12, line13, line14, line15, line16, line17 };
};
