import { max0, r, sum } from '../money';
import { paramStatus, paramsFor, type TaxParams } from '../params';
import type { TaxReturn } from '../model';
import { marginalRate, ordinaryTax } from './brackets';
import { qdcgWorksheet, type QdcgWorksheet } from './qdcg';
import { scheduleD, type ScheduleD } from './schedD';
import { scheduleA, type ScheduleA } from './schedA';
import { schedule1A, type Schedule1A } from './sched1A';
import { form8959, form8960, netScheduleC, scheduleSE, type Form8959, type Form8960, type ScheduleSE } from './otherTaxes';
import { form8995, schedule3, schedule8812, type Form8995, type Schedule3, type Schedule8812 } from './credits';
import { fbar as computeFbar, type Fbar } from './fbar';
import { form1116, type Form1116 } from './f1116';
import { form3520, form8938, type Form3520, type Form8938 } from './foreign';
import { inheritedSales, type InheritedSale } from './inherited';
import { form540, type Form540 } from './ca540';

export interface ScheduleB {
  required: boolean;
  interest: Array<{ payer: string; amount: number }>;
  line2: number;
  line4: number;
  dividends: Array<{ payer: string; amount: number }>;
  line6: number;
  /** Part III is required whenever there is a foreign account, whatever the income. */
  line7a: boolean;
  line7aFbarRequired: boolean;
  /** Line 7b: countries where the accounts are held. */
  line7b: string[];
}

export interface Schedule1 {
  line3: number; // business income (Schedule C)
  line5: number; // rents and royalties (1099-MISC boxes 1 and 2, gross; Schedule E not modeled)
  line8z: number; // other income (1099-MISC boxes 3 and 8)
  line10: number; // total additional income -> 1040 line 8
  line13: number; // HSA
  line15: number; // half SE tax
  line20: number; // IRA
  line21: number; // student loan
  line24z: number; // other
  line26: number; // total adjustments -> 1040 line 10
}

export interface Schedule2 {
  line4: number; // SE tax
  line11: number; // additional Medicare
  line12: number; // NIIT
  line21: number; // total -> 1040 line 17
}

export interface Form1040 {
  line1a: number; line1z: number;
  line2a: number; line2b: number;
  line3a: number; line3b: number;
  line7: number; line7ScheduleDNotRequired: boolean;
  line8: number; line9: number; line10: number; line11: number;
  line12: number; line12IsItemized: boolean;
  line13a: number; line13b: number; line14: number; line15: number;
  line16: number; line16Method: 'table' | 'qdcg';
  line17: number; line18: number;
  line19: number; line20: number; line21: number; line22: number;
  line23: number; line24: number;
  line25a: number; line25b: number; line25c: number; line25d: number;
  line26: number; line28: number; line31: number; line33: number;
  line34: number; line37: number;
  effectiveRate: number;
  marginalRate: number;
}

export interface ComputedReturn {
  taxYear: number;
  filingStatus: TaxReturn['filingStatus'];
  f1040: Form1040;
  schedule1: Schedule1;
  schedule2: Schedule2;
  schedule3: Schedule3;
  scheduleA: ScheduleA;
  scheduleB: ScheduleB;
  scheduleD: ScheduleD;
  scheduleSE: ScheduleSE[];
  schedule1A: Schedule1A;
  schedule8812: Schedule8812;
  f8959: Form8959;
  f8960: Form8960;
  f8995: Form8995;
  fbar: Fbar;
  f1116: Form1116 | null;
  f3520: Form3520;
  f8938: Form8938;
  inheritedSales: InheritedSale[];
  /** California Form 540, when the return files in California. */
  ca: Form540 | null;
  qdcg: QdcgWorksheet | null;
  standardDeduction: number;
  attachments: string[];
  /** Reports filed somewhere other than with the 1040, such as the FBAR with FinCEN. */
  separateFilings: string[];
  warnings: string[];
  unverifiedParameters: string[];
}

const standardDeductionFor = (ret: TaxReturn, p: TaxParams): number => {
  const ps = paramStatus(ret.filingStatus);
  const married = ps === 'mfj' || ps === 'mfs';
  const extra = p.additionalStandardDeduction[married ? 'married' : 'unmarried'];
  const conditions =
    (ret.taxpayer.age65OrOlder ? 1 : 0) + (ret.taxpayer.blind ? 1 : 0) +
    (ret.spouse?.age65OrOlder ? 1 : 0) + (ret.spouse?.blind ? 1 : 0);
  return p.standardDeduction[ps] + conditions * extra;
};

export const computeReturn = (ret: TaxReturn): ComputedReturn => {
  const p = paramsFor(ret.taxYear);
  const fs = ret.filingStatus;
  const ps = paramStatus(fs);
  const warnings: string[] = [];

  // ---- Income ----
  const line1a = sum(ret.w2s.map((w) => r(w.box1)));
  const line1z = line1a;

  const interest = ret.int1099s.map((i) => ({ payer: i.payer, amount: r(i.box1) + r(i.box3) }));
  const line2a = sum(ret.int1099s.map((i) => r(i.box8)));
  const line2b = sum(interest.map((i) => i.amount));
  const dividends = ret.div1099s.map((d) => ({ payer: d.payer, amount: r(d.box1a) }));
  const line3b = sum(dividends.map((d) => d.amount));
  const line3a = sum(ret.div1099s.map((d) => r(d.box1b)));
  const fbarReport = computeFbar(ret);
  const scheduleB: ScheduleB = {
    required: line2b > 1500 || line3b > 1500 || fbarReport.hasAccounts,
    interest, line2: line2b, line4: line2b, dividends, line6: line3b,
    line7a: fbarReport.hasAccounts,
    line7aFbarRequired: fbarReport.required,
    line7b: fbarReport.countries,
  };

  // ---- Foreign-source items (Form 1116) ----
  const foreignInt = ret.int1099s.filter((i) => i.foreignCountry.trim());
  const foreignInterest = sum(foreignInt.map((i) => r(i.box1)));
  const foreignDiv = ret.div1099s.filter((d) => d.box7 > 0);
  const foreignOrdinaryDividends = sum(foreignDiv.map((d) => r(d.foreignSourceDividends > 0 ? d.foreignSourceDividends : d.box1a)));
  const foreignQualifiedDividends = sum(foreignDiv.map((d) => {
    const src = d.foreignSourceDividends > 0 ? d.foreignSourceDividends : d.box1a;
    return d.box1a > 0 ? r(src * (d.box1b / d.box1a)) : 0;
  }));
  if (foreignDiv.some((d) => d.foreignSourceDividends === 0)) warnings.push('A 1099-DIV with foreign tax has no foreign-source dividend amount entered; all of box 1a is treated as foreign source for Form 1116. Take the figure from the broker supplemental statement.');
  const inherited = inheritedSales(ret.inheritedProperty);
  const foreignLongTermGain = sum(inherited.map((s) => s.gainUsd));
  const foreignTaxesPaid = sum(foreignInt.map((i) => r(i.foreignTaxPaid))) + sum(foreignDiv.map((d) => r(d.box7))) + sum(inherited.map((s) => s.foreignTaxPaidUsd));
  // The direct election needs every foreign item on a payee statement (1099); foreign bank interest and a property sale are not.
  const electionAllowed = ret.foreignTaxCreditMethod === 'auto' && foreignInt.length === 0 && inherited.length === 0 && foreignTaxesPaid <= p.foreignTaxCreditDirectLimit[ps];

  const capGainDist = sum(ret.div1099s.map((d) => r(d.box2a)));
  const lots = [...ret.lots, ...inherited.map((s) => s.lot)];
  const schedD = scheduleD(lots, ret.capitalLossCarryover, capGainDist, fs, p);
  const line7 = schedD.required ? schedD.line7Form1040 : capGainDist;

  const netSchedC = netScheduleC(ret);
  const se = scheduleSE(ret, p);
  const miscRents = sum(ret.misc1099s.map((m) => r(m.box1) + r(m.box2)));
  const miscOther = sum(ret.misc1099s.map((m) => r(m.box3) + r(m.box8)));
  if (miscRents) warnings.push(`1099-MISC rents and royalties of ${miscRents} are taken gross on Schedule 1 line 5; Schedule E expenses are not modeled.`);
  const schedule1: Schedule1 = {
    line3: netSchedC,
    line5: miscRents,
    line8z: miscOther,
    line10: netSchedC + miscRents + miscOther,
    line13: r(ret.adjustments.hsaDeduction),
    line15: sum(se.map((s) => s.line13)),
    line20: r(ret.adjustments.iraDeduction),
    line21: r(ret.adjustments.studentLoanInterest),
    line24z: r(ret.adjustments.other),
    line26: 0,
  };
  schedule1.line26 = schedule1.line13 + schedule1.line15 + schedule1.line20 + schedule1.line21 + schedule1.line24z;

  const line8 = schedule1.line10;
  const line9 = line1z + line2b + line3b + line7 + line8;
  const line10 = schedule1.line26;
  const line11 = line9 - line10;
  const agi = line11;

  // ---- Deductions ----
  const standardDeduction = standardDeductionFor(ret, p);
  const schedA = scheduleA(ret, agi, fs, p);
  let itemized = schedA.line17;
  const method = ret.deductionMethod === 'auto' && ret.forceStandardDeduction ? 'standard' : ret.deductionMethod;
  const useItemized = method === 'itemized' ? true : method === 'standard' ? false : itemized > standardDeduction;
  if (method === 'standard' && itemized > standardDeduction) warnings.push(`Standard deduction chosen; itemizing would deduct ${itemized - standardDeduction} more.`);
  if (method === 'itemized' && standardDeduction > itemized) warnings.push(`Itemized deductions chosen; the standard deduction would be ${standardDeduction - itemized} more.`);
  const nonItemizerCharity = useItemized
    ? 0
    : Math.min(r(ret.itemized.charityCash), p.charity.nonItemizerCash[ps]);
  let line12 = useItemized ? itemized : standardDeduction + nonItemizerCharity;

  const s1a = schedule1A(ret, agi, fs, p);
  const line13b = s1a.total;

  // QBI needs taxable income before the QBI deduction; the 2/37 itemized
  // limitation needs taxable income too, so iterate once (it converges
  // immediately because the limitation depends only on the 37% threshold).
  const netCapitalGain = max0(Math.min(schedD.line15, schedD.line16)) + line3a;
  const taxableBeforeQbi0 = max0(agi - line12 - line13b);
  if (useItemized && p.itemizedLimitationFor37Bracket) {
    const top = p.brackets[ps].at(-2)!.upTo!;
    const inTop = max0(taxableBeforeQbi0 - top);
    const reduction = r(Math.min(itemized, inTop) * (2 / 37));
    if (reduction > 0) {
      itemized -= reduction;
      line12 = itemized;
      warnings.push(`Itemized deductions reduced by ${reduction} under the 2/37 limitation (IRC 68).`);
    }
  }
  const taxableBeforeQbi = max0(agi - line12 - line13b);
  const f8995 = form8995(ret, { netQbi: netSchedC, taxableBeforeQbi, netCapitalGain }, fs, p);
  if (f8995.needsForm8995A) warnings.push('Taxable income exceeds the QBI threshold with positive business QBI: Form 8995-A is required and is not implemented.');
  const line13a = f8995.line15;
  const line14 = line12 + line13a + line13b;
  const line15 = max0(agi - line14);

  // ---- Tax ----
  let qdcg: QdcgWorksheet | null = null;
  let line16: number;
  let line16Method: Form1040['line16Method'] = 'table';
  const hasPreferential = line3a > 0 || line7 > 0;
  if (hasPreferential) {
    qdcg = qdcgWorksheet(
      {
        taxableIncome: line15,
        qualifiedDividends: line3a,
        ...(schedD.required ? { schedDLine15: schedD.line15, schedDLine16: schedD.line16 } : { line7 }),
      },
      fs, p,
    );
    line16 = qdcg.line25;
    line16Method = 'qdcg';
  } else {
    line16 = ordinaryTax(line15, fs, p);
  }

  const line17 = 0; // Schedule 2 Part I (AMT, excess APTC) not implemented
  const line18 = line16 + line17;

  // ---- Credits ----
  let f1116: Form1116 | null = null;
  if (foreignTaxesPaid > 0 && !electionAllowed) {
    const grossIncomeAllSources = line1z + line2b + line3b + max0(line7) + max0(line8);
    f1116 = form1116({
      foreignInterest, foreignOrdinaryDividends, foreignQualifiedDividends, foreignLongTermGain,
      foreignTaxesPaid,
      carryoverFromPriorYears: r(ret.foreignTaxCreditCarryover),
      grossIncomeAllSources,
      line3aDeductions: useItemized ? schedA.line4 + Math.min(schedA.line5b + schedA.line5c, schedA.line5e) : standardDeduction,
      line3bDeductions: schedule1.line13 + schedule1.line20 + schedule1.line21 + schedule1.line24z,
      mortgageInterest: useItemized ? schedA.line10 : 0,
      taxableIncome: line15,
      usTax: line18,
      qdcg,
    }, fs, p);
    if (f1116.carryforward > 0) warnings.push(`Foreign tax of ${f1116.carryforward} exceeds this year's Form 1116 limit; carry it back one year or forward up to ten (Schedule B of Form 1116).`);
    if (f1116.adjustmentRequired) warnings.push('Form 1116 rate differential adjustment applied to foreign capital gains and qualified dividends; the split across the 0%, 15% and 20% rates follows the worldwide worksheet proportions.');
  }
  const foreignTaxCredit = f1116 ? f1116.line35 : foreignTaxesPaid;
  const sched3 = schedule3(ret, { taxBeforeCredits: line18, foreignTaxCredit, foreignTaxCreditMethod: f1116 ? 'form1116' : 'election' }, fs, p);
  const earnedIncome = line1z + max0(netSchedC) - schedule1.line15;
  const s8812 = schedule8812(ret, { agi, taxLimit: line18 - sched3.line8, earnedIncome }, fs, p);
  const line19 = s8812.line14;
  const line20 = sched3.line8;
  const line21 = line19 + line20;
  const line22 = max0(line18 - line21);

  // ---- Other taxes (Schedule 2 Part II) ----
  const f8959 = form8959(ret, se, fs, p);
  const magi = agi;
  const f8960 = form8960({ taxableInterest: line2b, ordinaryDividends: line3b, netGain: line7, magi }, fs, p);
  const schedule2: Schedule2 = {
    line4: sum(se.map((s) => s.line12)),
    line11: f8959.line18,
    line12: f8960.line17,
    line21: 0,
  };
  schedule2.line21 = schedule2.line4 + schedule2.line11 + schedule2.line12;
  const line23 = schedule2.line21;
  const line24 = line22 + line23;

  // ---- Payments ----
  const line25a = sum(ret.w2s.map((w) => r(w.box2)));
  const line25b = sum(ret.int1099s.map((i) => r(i.box4))) + sum(ret.div1099s.map((d) => r(d.box4))) + sum(ret.misc1099s.map((m) => r(m.box4)));
  const line25c = f8959.line24 + r(ret.payments.otherWithholding);
  const line25d = line25a + line25b + line25c;
  const line26 = r(ret.payments.estimated);
  const line28 = s8812.line27;
  const line31 = sched3.line15;
  const line33 = line25d + line26 + line28 + line31;
  const line34 = max0(line33 - line24);
  const line37 = max0(line24 - line33);

  // ---- Attachments ----
  const attachments: string[] = ['Form 1040'];
  if (schedule1.line10 !== 0 || schedule1.line26 !== 0) attachments.push('Schedule 1');
  if (schedule2.line21 !== 0) attachments.push('Schedule 2');
  if (sched3.line8 !== 0 || sched3.line15 !== 0) attachments.push('Schedule 3');
  if (useItemized) attachments.push('Schedule A');
  if (scheduleB.required) attachments.push('Schedule B');
  if (ret.scheduleC.length) attachments.push('Schedule C');
  if (schedD.required) attachments.push('Schedule D', ...schedD.f8949.map((x) => `Form 8949 (Box ${x.box})`));
  if (se.length) attachments.push('Schedule SE');
  if (line13b > 0) attachments.push('Schedule 1-A');
  if (s8812.line12 > 0) attachments.push('Schedule 8812');
  if (f8959.required) attachments.push('Form 8959');
  if (f8960.required) attachments.push('Form 8960');
  if (f8995.required) attachments.push('Form 8995');
  if (schedule1.line13 > 0) attachments.push('Form 8889');
  if (f1116?.required) attachments.push('Form 1116');
  const f3520 = form3520(ret, p);
  const f8938 = form8938(ret, fs);
  if (f8938.required) attachments.push('Form 8938');

  const separateFilings: string[] = [];
  for (const filing of fbarReport.filings) {
    if (!filing.required) continue;
    const who = fbarReport.filings.length > 1 ? ` (${filing.filer})` : '';
    separateFilings.push(`FinCEN Form 114 FBAR${who}: e-file with FinCEN by ${fbarReport.dueDate}, automatic extension to ${fbarReport.extendedDueDate}`);
  }
  if (fbarReport.jointFilingAllowed) separateFilings.push('Spouses may submit one FBAR: file under the taxpayer, report the joint accounts in Part III, and keep a signed Form 114a');
  if (fbarReport.filings.some((f) => f.anyValueUnknown)) warnings.push('A foreign account has an unknown maximum value: FinCEN requires filing the FBAR and checking box 15a for that account.');
  if (f8938.required && f8938.partV.some((a) => a.yearEndAssumed)) warnings.push('Form 8938: a foreign account has no December 31 balance entered, so its maximum value was used for the last-day test.');
  if (f3520.required) separateFilings.push(`Form 3520 (foreign gifts and bequests, Part IV): mail to ${f3520.mailTo} by ${f3520.dueDate}, or ${f3520.extendedDueDate} if the return is extended. Late penalty 5% of the amount per month, up to 25%.`);
  if (inherited.length) warnings.push('Inherited property: basis is the fair market value at the date of death (IRC 1014). Keep the appraisal or Korean inheritance-tax valuation and the exchange rates used.');

  if (ret.adjustments.hsaDeduction > 0) warnings.push('HSA deduction is taken as entered; Form 8889 limit checks are not yet implemented.');
  if (schedA.line8a > 0 && useItemized) warnings.push('Mortgage interest is taken as entered; the $750,000 acquisition-debt limit is not checked.');

  // ---- California ----
  const filesCa = ret.california.file === 'yes' || (ret.california.file === 'auto' && ret.w2s.some((w) => w.state.toUpperCase() === 'CA'));
  const ca = filesCa ? form540(ret, { agi, scheduleA: schedA, capitalGainDistributions: capGainDist, federalLine7: line7, lots, federalParams: p }) : null;

  const f1040: Form1040 = {
    line1a, line1z, line2a, line2b, line3a, line3b,
    line7, line7ScheduleDNotRequired: !schedD.required,
    line8, line9, line10, line11,
    line12, line12IsItemized: useItemized,
    line13a, line13b, line14, line15,
    line16, line16Method, line17, line18,
    line19, line20, line21, line22, line23, line24,
    line25a, line25b, line25c, line25d, line26, line28, line31, line33,
    line34, line37,
    effectiveRate: line11 > 0 ? line24 / line11 : 0,
    marginalRate: marginalRate(line15, fs, p),
  };

  return {
    taxYear: ret.taxYear,
    filingStatus: fs,
    f1040,
    schedule1, schedule2, schedule3: sched3,
    scheduleA: schedA, scheduleB, scheduleD: schedD, scheduleSE: se,
    schedule1A: s1a, schedule8812: s8812,
    f8959, f8960, f8995, fbar: fbarReport, f1116, f3520, f8938, inheritedSales: inherited, ca, qdcg,
    standardDeduction,
    attachments,
    separateFilings,
    warnings,
    unverifiedParameters: p.unverified,
  };
};
