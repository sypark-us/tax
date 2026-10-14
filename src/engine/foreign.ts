/**
 * Information reports that a foreign inheritance or foreign account can
 * trigger beside the FBAR:
 *
 * - Form 3520 Part IV (IRC 6039F): gifts or bequests from a nonresident
 *   alien or foreign estate totalling more than $100,000 in the year, or
 *   from a foreign corporation or partnership above an indexed amount.
 *   Mailed separately to the Ogden service center, due with the return
 *   (April 15, or October 15 on extension). Penalty 5% a month up to 25%.
 * - Form 8938 (IRC 6038D, FATCA): attached to the 1040 when specified
 *   foreign financial assets exceed the thresholds. Accounts are valued at
 *   their maximum during the year at the Treasury December 31 rate.
 *   Directly held real estate is not a specified foreign financial asset.
 */
import { max0, r, sum } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';
import type { ForeignGift, TaxReturn } from '../model';

export const FORM_3520_INDIVIDUAL_THRESHOLD = 100_000;
export const FORM_3520_LIST_EACH_OVER = 5_000;
export const FORM_3520_MAIL_TO = 'Internal Revenue Service Center, P.O. Box 409101, Ogden, UT 84409';

export interface Form3520Gift {
  index: number;
  date: string;
  description: string;
  donorName: string;
  donorType: ForeignGift['donorType'];
  donorCountry: string;
  fmvUsd: number;
  currency: string;
  amount: number;
  rate: number;
}

export interface Form3520 {
  required: boolean;
  /** Line 54: nonresident alien individuals and foreign estates. */
  line54: { total: number; required: boolean; gifts: Form3520Gift[]; noneOver5000: boolean };
  /** Line 55: foreign corporations and partnerships. */
  line55: { total: number; threshold: number; required: boolean; gifts: Form3520Gift[] };
  dueDate: string;
  extendedDueDate: string;
  mailTo: string;
}

const giftUsd = (g: ForeignGift, i: number): Form3520Gift => ({
  index: i,
  date: g.date,
  description: g.description,
  donorName: g.donorName,
  donorType: g.donorType,
  donorCountry: g.donorCountry,
  fmvUsd: r(g.amount / g.rate),
  currency: g.currency.toUpperCase(),
  amount: g.amount,
  rate: g.rate,
});

export const form3520 = (ret: TaxReturn, p: TaxParams): Form3520 => {
  const all = ret.foreignGifts.map(giftUsd);
  const indiv = all.filter((g) => g.donorType === 'individual' || g.donorType === 'estate');
  const corp = all.filter((g) => g.donorType === 'corporation' || g.donorType === 'partnership');
  const total54 = sum(indiv.map((g) => g.fmvUsd));
  const total55 = sum(corp.map((g) => g.fmvUsd));
  const required54 = total54 > FORM_3520_INDIVIDUAL_THRESHOLD;
  const required55 = total55 > p.foreignGiftCorporateThreshold;
  const listed54 = indiv.filter((g) => g.fmvUsd > FORM_3520_LIST_EACH_OVER);
  return {
    required: required54 || required55,
    line54: { total: total54, required: required54, gifts: required54 ? listed54 : [], noneOver5000: required54 && listed54.length === 0 },
    line55: { total: total55, threshold: p.foreignGiftCorporateThreshold, required: required55, gifts: required55 ? corp : [] },
    dueDate: `${ret.taxYear + 1}-04-15`,
    extendedDueDate: `${ret.taxYear + 1}-10-15`,
    mailTo: FORM_3520_MAIL_TO,
  };
};

/** Form 8938 thresholds for a specified individual living in the United States. */
export const FORM_8938_THRESHOLDS: Record<'joint' | 'other', { lastDay: number; anyTime: number }> = {
  joint: { lastDay: 100_000, anyTime: 150_000 },
  other: { lastDay: 50_000, anyTime: 75_000 },
};

export interface Form8938Account {
  index: number;
  /** Part V line 20: deposit (bank) or custodial (securities, other). */
  kind: 'deposit' | 'custodial';
  institution: string;
  accountNumber: string;
  address: string;
  country: string;
  openedThisYear: boolean;
  closedThisYear: boolean;
  jointWithSpouse: boolean;
  currency: string;
  maxValue: number;
  treasuryRate: number;
  maxValueUsd: number;
  yearEndValueUsd: number;
  yearEndAssumed: boolean;
}

export interface Form8938 {
  hasAssets: boolean;
  required: boolean;
  threshold: { lastDay: number; anyTime: number };
  /** Aggregate value on December 31 and the aggregate of maximum values. */
  lastDayValue: number;
  anyTimeValue: number;
  partI: { line5: number; line6: number; line7: number; line8: number; line9AnyClosed: boolean };
  /** Part III: income from the reported accounts and where it lands on the return. */
  partIII: { interest: number; dividends: number; gains: number };
  partV: Form8938Account[];
}

export const form8938 = (ret: TaxReturn, fs: FilingStatus): Form8938 => {
  const ps = paramStatus(fs);
  const threshold = FORM_8938_THRESHOLDS[ps === 'mfj' ? 'joint' : 'other'];
  const partV: Form8938Account[] = ret.foreignAccounts
    .map((a, index) => {
      const maxValueUsd = a.maxValueUnknown ? 0 : r(a.maxValue / a.treasuryRate);
      const yearEnd = a.closedThisYear ? 0 : a.yearEndValue;
      return {
        index,
        kind: a.accountType === 'bank' ? 'deposit' as const : 'custodial' as const,
        institution: a.institution,
        accountNumber: a.accountNumber,
        address: [a.street, a.city, a.stateProvince, a.postalCode].filter(Boolean).join(', '),
        country: a.country,
        openedThisYear: a.openedThisYear,
        closedThisYear: a.closedThisYear,
        jointWithSpouse: a.owner === 'joint',
        currency: a.currency.toUpperCase(),
        maxValue: a.maxValue,
        treasuryRate: a.treasuryRate,
        maxValueUsd,
        yearEndValueUsd: yearEnd === undefined ? maxValueUsd : r(max0(yearEnd) / a.treasuryRate),
        yearEndAssumed: yearEnd === undefined && !a.closedThisYear,
      };
    })
    // Signature-authority-only accounts are not the filer's assets.
    .filter((x) => !ret.foreignAccounts[x.index]!.signatureAuthorityOnly);

  const lastDayValue = sum(partV.map((x) => x.yearEndValueUsd));
  const anyTimeValue = sum(partV.map((x) => x.maxValueUsd));
  const deposit = partV.filter((x) => x.kind === 'deposit');
  const custodial = partV.filter((x) => x.kind === 'custodial');
  const interest = sum(ret.int1099s.filter((i) => i.foreignCountry.trim()).map((i) => r(i.box1)));
  return {
    hasAssets: partV.length > 0,
    required: lastDayValue > threshold.lastDay || anyTimeValue > threshold.anyTime,
    threshold,
    lastDayValue,
    anyTimeValue,
    partI: {
      line5: deposit.length,
      line6: sum(deposit.map((x) => x.maxValueUsd)),
      line7: custodial.length,
      line8: sum(custodial.map((x) => x.maxValueUsd)),
      line9AnyClosed: partV.some((x) => x.closedThisYear),
    },
    partIII: { interest, dividends: 0, gains: 0 },
    partV,
  };
};
