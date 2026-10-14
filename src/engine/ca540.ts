/**
 * California Form 540 (resident) with Schedule CA (540) adjustments.
 *
 * California starts from federal AGI and adjusts for the places it does
 * not follow the Internal Revenue Code. Its conformity date is January 1,
 * 2025 (SB 711), so nothing from the July 2025 OBBBA applies: no tips,
 * overtime, senior or car-loan deductions, no non-itemizer charity
 * deduction, no SALT cap, no 0.5% charity floor. Those federal items are
 * all below AGI, so most of them need no adjustment here; the ones that
 * reach AGI are handled in Schedule CA Part I.
 *
 * Covered: wages, interest (US Treasury interest exempt), dividends,
 * capital gains (ordinary rates, own carryover), Schedule C, HSA add-back
 * (deduction and employer contributions), itemized deductions with the
 * state's own limitation, standard deduction, exemption credits with the
 * AGI phase-out, the tax table midpoint rule, the renter's credit, the
 * Behavioral Health Services Tax, withholding and estimated payments.
 *
 * Not covered, each flagged in warnings when it could matter: Schedule P
 * AMT, CalEITC and the young child credit, Form 3853 health coverage
 * penalty, use tax, Schedule S other-state credit, registered domestic
 * partner recalculations. California gives no credit for foreign taxes.
 */
import { max0, pct, r, sum } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';
import { caParamsFor, type CaParams } from '../params/ca';
import type { Lot, TaxReturn } from '../model';
import { scheduleD, type ScheduleD } from './schedD';
import type { ScheduleA } from './schedA';

export interface ScheduleCA {
  /** Part I additions (column C) and subtractions (column B) that change AGI. */
  line1hEmployerHsa: number; // col C
  line2TreasuryInterest: number; // col B
  line2NonCaliforniaMuni: number; // col C
  line7CapitalGainAdjustment: number; // + col C / - col B
  line13HsaDeduction: number; // col B of the adjustments section
  line27Other: number; // + addition / - subtraction
  subtractions: number; // Form 540 line 14
  additions: number; // Form 540 line 16
  /** Part II itemized deductions. */
  line4Medical: number;
  line5bRealEstateTax: number;
  line5cPersonalPropertyTax: number;
  line8MortgageInterest: number;
  line14Charity: number;
  line16Other: number;
  line28Total: number;
  line29Limited: number;
  itemizedReduction: number;
  line30: number; // larger of itemized and standard -> Form 540 line 18
  usesItemized: boolean;
}

export interface Form540 {
  taxYear: number;
  filingStatus: FilingStatus;
  line7PersonalCount: number; line7: number;
  line8BlindCount: number; line8: number;
  line9SeniorCount: number; line9: number;
  line10DependentCount: number; line10: number;
  line11: number;
  line12StateWages: number;
  line13FederalAgi: number;
  line14: number; line15: number; line16: number;
  line17CaAgi: number;
  line18: number; line18IsItemized: boolean;
  line19TaxableIncome: number;
  line31Tax: number; line31Method: 'table' | 'schedule';
  line32ExemptionCredits: number;
  line33: number; line35: number;
  line46RenterCredit: number;
  line47: number; line48: number;
  line61Amt: number;
  line62BehavioralHealthTax: number;
  line64TotalTax: number;
  line71Withholding: number;
  line72Estimated: number;
  line78TotalPayments: number;
  line92Isr: number;
  line97Overpaid: number;
  line100TaxDue: number;
  effectiveRate: number;
  marginalRate: number;
  scheduleCA: ScheduleCA;
  scheduleD: ScheduleD | null;
  attachments: string[];
  warnings: string[];
  unverifiedParameters: string[];
}

export interface FederalFigures {
  agi: number;
  scheduleA: ScheduleA;
  capitalGainDistributions: number;
  /** Federal 1040 line 7 after the loss limit, to compare against the California figure. */
  federalLine7: number;
  /** Every lot on the federal Schedule D, including inherited-property sales. */
  lots: Lot[];
  federalParams: TaxParams;
}

const scheduleTax = (ti: number, fs: FilingStatus, p: CaParams): number => {
  let tax = 0;
  let lower = 0;
  for (const br of p.brackets[paramStatus(fs)]) {
    const upper = br.upTo ?? Infinity;
    if (ti <= lower) break;
    tax += (Math.min(ti, upper) - lower) * br.rate;
    lower = upper;
  }
  return tax;
};

/**
 * Form 540 line 31. The FTB tax table covers taxable income up to
 * $100,000 in $100 ranges ($1-50, $51-150, $151-250, ...) and shows the
 * schedule tax at the midpoint of each range. Above that the rate
 * schedule is applied to the exact amount, rounded to cents and then to
 * dollars, as in the booklet's example ($125,000 MFJ -> $4,768).
 */
export const caTax = (ti: number, fs: FilingStatus, p: CaParams): { tax: number; method: 'table' | 'schedule' } => {
  if (ti <= 0) return { tax: 0, method: 'table' };
  if (ti <= p.taxTableCeiling) {
    const lower = ti <= 50 ? 1 : Math.floor((ti - 51) / 100) * 100 + 51;
    // The last range stops at the ceiling ($99,951-$100,000), so its midpoint is $99,975.50.
    const upper = ti <= 50 ? 50 : Math.min(lower + 99, p.taxTableCeiling);
    const mid = (lower + upper) / 2;
    return { tax: Math.round(scheduleTax(mid, fs, p)), method: 'table' };
  }
  const cents = Math.round(scheduleTax(ti, fs, p) * 100) / 100;
  return { tax: Math.round(cents), method: 'schedule' };
};

export const caMarginalRate = (ti: number, fs: FilingStatus, p: CaParams): number => {
  for (const br of p.brackets[paramStatus(fs)]) if (br.upTo === null || ti <= br.upTo) return br.rate;
  return 0;
};

export const form540 = (ret: TaxReturn, fed: FederalFigures): Form540 => {
  const p = caParamsFor(ret.taxYear);
  const fs = ret.filingStatus;
  const ps = paramStatus(fs);
  const ca = ret.california;
  const warnings: string[] = [];
  const married = fs === 'mfj' || fs === 'qss';

  // ---- Schedule CA Part I: adjustments to federal AGI ----
  const employerHsa = sum(ret.w2s.flatMap((w) => w.box12.filter((b) => b.code.toUpperCase() === 'W').map((b) => r(b.amount))));
  const treasuryInterest = sum(ret.int1099s.map((i) => r(i.box3)));
  const nonCaMuni = r(ca.taxExemptInterestNonCalifornia);
  const hsaDeduction = r(ret.adjustments.hsaDeduction);

  // Capital gains: California taxes them as ordinary income and keeps its own loss carryover.
  const caCarry = ca.capitalLossCarryover ?? ret.capitalLossCarryover;
  let schedD: ScheduleD | null = null;
  let capitalGainAdjustment = 0;
  if (ca.capitalLossCarryover && (caCarry.shortTerm !== ret.capitalLossCarryover.shortTerm || caCarry.longTerm !== ret.capitalLossCarryover.longTerm)) {
    schedD = scheduleD(fed.lots, caCarry, fed.capitalGainDistributions, fs, fed.federalParams);
    capitalGainAdjustment = schedD.line7Form1040 - fed.federalLine7;
    warnings.push('Schedule D (540) attached: the California capital loss carryover differs from the federal one.');
  }

  const other = r(ca.otherAdditions) - r(ca.otherSubtractions);
  const subtractions = treasuryInterest + hsaDeduction + max0(-capitalGainAdjustment) + max0(-other);
  const additions = employerHsa + nonCaMuni + max0(capitalGainAdjustment) + max0(other);
  if (employerHsa || hsaDeduction) warnings.push('California does not recognize HSAs: the deduction and employer contributions are added back. Interest earned inside the HSA is also taxable to California and is not modeled.');

  const line12 = sum(ret.w2s.filter((w) => w.state.toUpperCase() === 'CA').map((w) => r(w.box16)));
  const line13 = fed.agi;
  const line14 = subtractions;
  const line15 = line13 - line14;
  const line16 = additions;
  const line17 = line15 + line16;

  // ---- Schedule CA Part II: itemized deductions under California rules ----
  const it = ret.itemized;
  const a = fed.scheduleA;
  const line4Medical = a.line4; // federal 7.5% floor, same for California
  const line5b = r(it.realEstateTax);
  const line5c = r(it.personalPropertyTax);
  const line8Mortgage = r(it.mortgageInterest);
  const line14Charity = r(it.charityCash) + r(it.charityNoncash);
  const line16Other = r(it.other);
  const line28 = line4Medical + line5b + line5c + line8Mortgage + line14Charity + line16Other;
  let reduction = 0;
  if (line13 > p.itemizedLimitationStart[ps] && line28 > 0) {
    const subject = max0(line28 - line4Medical); // medical, investment interest and casualty losses are not reduced
    reduction = Math.min(pct(subject, p.itemizedLimitationMaxReduction), pct(line13 - p.itemizedLimitationStart[ps], p.itemizedLimitationRate));
  }
  const line29 = line28 - reduction;
  const standard = p.standardDeduction[ps];
  const usesItemized = line29 > standard;
  const line18 = usesItemized ? line29 : standard;
  const line19 = max0(line17 - line18);

  // ---- Exemption credits (lines 7-11) with the line 32 AGI limitation ----
  const personalCount = married ? 2 : 1;
  const blindCount = (ret.taxpayer.blind ? 1 : 0) + (married && ret.spouse?.blind ? 1 : 0);
  const seniorCount = (ret.taxpayer.age65OrOlder ? 1 : 0) + (married && ret.spouse?.age65OrOlder ? 1 : 0);
  const dependentCount = ret.dependents.length;
  const line7 = personalCount * p.personalExemptionCredit;
  const line8 = blindCount * p.personalExemptionCredit;
  const line9 = seniorCount * p.personalExemptionCredit;
  const line10 = dependentCount * p.dependentExemptionCredit;
  const line11 = line7 + line8 + line9 + line10;
  let line32 = line11;
  if (line13 > p.exemptionPhaseoutStart[ps]) {
    const steps = Math.ceil((line13 - p.exemptionPhaseoutStart[ps]) / p.exemptionPhaseoutStep[ps]);
    const perCredit = steps * p.exemptionPhaseoutPerStep;
    const personalAfter = max0(line7 + line8 + line9 - perCredit * (personalCount + blindCount + seniorCount));
    const dependentAfter = max0(line10 - perCredit * dependentCount);
    line32 = personalAfter + dependentAfter;
  }

  // ---- Tax ----
  const { tax: line31, method } = caTax(line19, fs, p);
  const line33 = max0(line31 - line32);
  const line35 = line33; // line 34 (Schedule G-1 / FTB 5870A) not modeled

  // ---- Credits ----
  let line46 = 0;
  if (ca.rentedPrincipalResidence && line17 <= p.renterCredit.agiLimit[ps]) line46 = p.renterCredit.amount[ps];
  const line47 = line46;
  const line48 = max0(line35 - line47);

  // ---- Other taxes ----
  const line61 = 0;
  if (usesItemized && line29 > 50_000) warnings.push('Large itemized deductions: check Schedule P (540) for California alternative minimum tax, which is not modeled.');
  const line62 = pct(max0(line19 - p.behavioralHealthTax.threshold), p.behavioralHealthTax.rate);
  const line64 = line48 + line61 + line62;

  // ---- Payments ----
  const line71 = sum(ret.w2s.filter((w) => w.state.toUpperCase() === 'CA').map((w) => r(w.box17)));
  const line72 = r(ca.estimatedPayments);
  const line78 = line71 + line72;
  const line92 = 0;
  if (!ca.fullYearHealthCoverage) warnings.push('No full-year health coverage: the Individual Shared Responsibility Penalty from form FTB 3853 is not computed and would be added on line 92.');
  const line97 = max0(line78 - line92 - line64);
  const line100 = max0(line64 - (line78 - line92));

  if (ret.foreignAccounts.length || ret.inheritedProperty.length || ret.int1099s.some((i) => i.foreignCountry)) warnings.push('California allows no credit for foreign income taxes; the Korean or other foreign tax credited federally does not reduce this return.');
  if (ret.scheduleC.length) warnings.push('Schedule C income is taxed as entered; California does not allow the federal QBI deduction (already excluded since it is below AGI).');

  const attachments = ['Form 540', 'Schedule CA (540)'];
  if (usesItemized) attachments.push('Federal Schedule A (copy)');
  if (schedD) attachments.push('Schedule D (540)');
  if (line46) attachments.push('Renter\'s Credit Qualification Record');

  return {
    taxYear: ret.taxYear,
    filingStatus: fs,
    line7PersonalCount: personalCount, line7,
    line8BlindCount: blindCount, line8,
    line9SeniorCount: seniorCount, line9,
    line10DependentCount: dependentCount, line10,
    line11,
    line12StateWages: line12,
    line13FederalAgi: line13,
    line14, line15, line16,
    line17CaAgi: line17,
    line18, line18IsItemized: usesItemized,
    line19TaxableIncome: line19,
    line31Tax: line31, line31Method: method,
    line32ExemptionCredits: line32,
    line33, line35,
    line46RenterCredit: line46,
    line47, line48,
    line61Amt: line61,
    line62BehavioralHealthTax: line62,
    line64TotalTax: line64,
    line71Withholding: line71,
    line72Estimated: line72,
    line78TotalPayments: line78,
    line92Isr: line92,
    line97Overpaid: line97,
    line100TaxDue: line100,
    effectiveRate: line17 > 0 ? line64 / line17 : 0,
    marginalRate: caMarginalRate(line19, fs, p),
    scheduleCA: {
      line1hEmployerHsa: employerHsa,
      line2TreasuryInterest: treasuryInterest,
      line2NonCaliforniaMuni: nonCaMuni,
      line7CapitalGainAdjustment: capitalGainAdjustment,
      line13HsaDeduction: hsaDeduction,
      line27Other: other,
      subtractions, additions,
      line4Medical, line5bRealEstateTax: line5b, line5cPersonalPropertyTax: line5c,
      line8MortgageInterest: line8Mortgage, line14Charity, line16Other,
      line28Total: line28, line29Limited: line29, itemizedReduction: reduction,
      line30: line18, usesItemized,
    },
    scheduleD: schedD,
    attachments,
    warnings,
    unverifiedParameters: p.unverified,
  };
};
