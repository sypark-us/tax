/**
 * FinCEN Form 114, Report of Foreign Bank and Financial Accounts (FBAR).
 *
 * The FBAR is not an IRS form. It is filed with FinCEN through the BSA
 * E-Filing System (https://bsaefiling.fincen.treas.gov), never attached to
 * Form 1040, and it cannot be mailed. This module decides who must file,
 * converts each account to US dollars the way the FinCEN instructions say,
 * and lays the accounts out by Part so they can be typed into the online
 * form. It also feeds Schedule B Part III (line 7a/7b) and feeds the
 * Form 8938 worksheet in foreign.ts.
 *
 * Rules applied (31 CFR 1010.350, FinCEN Form 114 instructions):
 * - A US person must file when the aggregate maximum value of all foreign
 *   financial accounts they own, co-own, or have signature authority over
 *   exceeded $10,000 at any time in the calendar year. $10,000 is a hard
 *   statutory threshold, not inflation-indexed.
 * - Each account's maximum value is converted at the Treasury Reporting
 *   Rate of Exchange for December 31 of the year, then rounded up to the
 *   next whole dollar.
 * - Once required, every account is reported, including small ones.
 * - Part II: accounts owned separately. Part III: jointly owned. Part IV:
 *   signature authority only.
 * - Spouses may file one FBAR (with Form 114a) only if every account of
 *   the non-filing spouse is jointly owned with the filing spouse.
 * - Due April 15 with an automatic extension to October 15.
 */
import type { FilingStatus, ForeignAccount, TaxReturn } from '../model';

export const FBAR_THRESHOLD = 10_000;

export type FbarPart = 'II' | 'III' | 'IV';
export type FbarFiler = 'taxpayer' | 'spouse';

export interface FbarAccount {
  index: number;
  part: FbarPart;
  institution: string;
  accountNumber: string;
  accountType: ForeignAccount['accountType'];
  otherTypeDescription: string;
  street: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  currency: string;
  maxValue: number;
  treasuryRate: number;
  /** Box 15: maximum value in US dollars, rounded up. 0 when unknown. */
  maxValueUsd: number;
  maxValueUnknown: boolean;
  /** Part III only: number of joint owners other than the filer. */
  jointOwnerCount: number;
  /** Part III only: principal joint owner. */
  principalJointOwner: string;
  principalJointOwnerTin: string;
}

export interface FbarFiling {
  filer: FbarFiler;
  /** Aggregate of the maximum values of every account this person must report. */
  aggregateMaxUsd: number;
  anyValueUnknown: boolean;
  required: boolean;
  accounts: FbarAccount[];
}

export interface Fbar {
  /** Any foreign account entered at all. Drives Schedule B line 7a. */
  hasAccounts: boolean;
  /** Someone in the household must file. */
  required: boolean;
  filings: FbarFiling[];
  /** Spouses can submit a single FBAR with Form 114a. */
  jointFilingAllowed: boolean;
  countries: string[];
  /** Household aggregate, each account counted once. */
  aggregateMaxUsd: number;
  dueDate: string;
  extendedDueDate: string;
}

/** FinCEN box 15: convert at the year-end Treasury rate and round up to the next dollar. */
export const toUsdRoundedUp = (amount: number, foreignPerUsd: number): number => {
  if (amount <= 0) return 0;
  const usd = amount / foreignPerUsd;
  // Guard against 1234.0000000001 rounding up to 1235 from floating point noise.
  return Math.ceil(usd - 1e-9);
};

const partFor = (a: ForeignAccount): FbarPart => {
  if (a.signatureAuthorityOnly) return 'IV';
  if (a.owner === 'joint' || a.otherJointOwner?.name) return 'III';
  return 'II';
};

const personName = (p: { firstName: string; lastName: string } | undefined): string =>
  p ? `${p.firstName} ${p.lastName}`.trim() : '';

const accountFor = (ret: TaxReturn, a: ForeignAccount, index: number, filer: FbarFiler): FbarAccount => {
  const part = partFor(a);
  const spouseName = personName(filer === 'taxpayer' ? ret.spouse : ret.taxpayer);
  const spouseIsJoint = a.owner === 'joint';
  const other = a.otherJointOwner?.name ? a.otherJointOwner : undefined;
  const jointOwnerCount = part === 'III' ? (spouseIsJoint ? 1 : 0) + (other ? 1 : 0) : 0;
  const principal = part === 'III' ? (spouseIsJoint ? spouseName || '(spouse)' : other?.name ?? '') : '';
  return {
    index,
    part,
    institution: a.institution,
    accountNumber: a.accountNumber,
    accountType: a.accountType,
    otherTypeDescription: a.otherTypeDescription,
    street: a.street, city: a.city, stateProvince: a.stateProvince, postalCode: a.postalCode, country: a.country,
    currency: a.currency.toUpperCase(),
    maxValue: a.maxValue,
    treasuryRate: a.treasuryRate,
    maxValueUsd: a.maxValueUnknown ? 0 : toUsdRoundedUp(a.maxValue, a.treasuryRate),
    maxValueUnknown: a.maxValueUnknown,
    jointOwnerCount,
    principalJointOwner: principal,
    principalJointOwnerTin: part === 'III' && !spouseIsJoint ? other?.tin ?? '' : '',
  };
};

/** Which spouse's FBAR an account belongs on. Joint accounts go on both. */
const filersFor = (a: ForeignAccount, married: boolean): FbarFiler[] => {
  if (!married) return ['taxpayer'];
  if (a.owner === 'joint') return ['taxpayer', 'spouse'];
  return [a.owner];
};

export const fbar = (ret: TaxReturn): Fbar => {
  const fs: FilingStatus = ret.filingStatus;
  const married = (fs === 'mfj' || fs === 'mfs' || fs === 'qss') && ret.spouse !== undefined;
  const year = ret.taxYear;
  const filers: FbarFiler[] = married ? ['taxpayer', 'spouse'] : ['taxpayer'];

  const filings: FbarFiling[] = filers.map((filer) => {
    const accounts = ret.foreignAccounts
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => filersFor(a, married).includes(filer))
      .map(({ a, i }) => accountFor(ret, a, i, filer));
    const aggregateMaxUsd = accounts.reduce((s, x) => s + x.maxValueUsd, 0);
    const anyValueUnknown = accounts.some((x) => x.maxValueUnknown);
    return {
      filer,
      aggregateMaxUsd,
      anyValueUnknown,
      // An undeterminable balance cannot prove the aggregate stayed at or under the threshold.
      required: aggregateMaxUsd > FBAR_THRESHOLD || anyValueUnknown,
      accounts,
    };
  });

  const spouseFiling = filings.find((f) => f.filer === 'spouse');
  const jointFilingAllowed =
    married && spouseFiling !== undefined && spouseFiling.required &&
    spouseFiling.accounts.length > 0 &&
    spouseFiling.accounts.every((x) => ret.foreignAccounts[x.index]!.owner === 'joint' && !x.maxValueUnknown);

  // Household figures: each account once, whichever spouse owns it.
  const all = ret.foreignAccounts.map((a, i) => accountFor(ret, a, i, 'taxpayer'));
  const aggregateMaxUsd = all.reduce((s, x) => s + x.maxValueUsd, 0);
  const countries = [...new Set(all.map((x) => x.country.trim()).filter(Boolean))].sort();

  return {
    hasAccounts: ret.foreignAccounts.length > 0,
    required: filings.some((f) => f.required),
    filings,
    jointFilingAllowed,
    countries,
    aggregateMaxUsd,
    dueDate: `${year + 1}-04-15`,
    extendedDueDate: `${year + 1}-10-15`,
  };
};
