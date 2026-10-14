import { z } from 'zod';

/** Dollar amount; cents allowed on input, rounded once by the engine. */
const money = z.number().finite();
const money0 = money.default(0);
const owner = z.enum(['taxpayer', 'spouse']).default('taxpayer');

export const FilingStatusSchema = z.enum(['single', 'mfj', 'mfs', 'hoh', 'qss']);

export const PersonSchema = z.object({
  firstName: z.string().default(''),
  lastName: z.string().default(''),
  age65OrOlder: z.boolean().default(false),
  blind: z.boolean().default(false),
});

export const DependentSchema = z.object({
  name: z.string().default(''),
  relationship: z.string().default(''),
  /** Age at the end of the tax year. Under 17 qualifies for the child tax credit. */
  age: z.number().int().nonnegative(),
  /** Qualifying child (vs qualifying relative) under IRC 152. */
  qualifyingChild: z.boolean().default(true),
  /** Has an SSN valid for employment (required for CTC). */
  hasValidSsn: z.boolean().default(true),
});

export const W2Schema = z.object({
  employer: z.string().default(''),
  owner,
  box1: money,
  box2: money0,
  box3: money0,
  box4: money0,
  box5: money0,
  box6: money0,
  box12: z.array(z.object({ code: z.string(), amount: money })).default([]),
  /** Box 14 / Box 12 details relevant to Schedule 1-A. */
  qualifiedTips: money0,
  qualifiedOvertime: money0,
  state: z.string().default(''),
  box16: money0,
  box17: money0,
});

export const Int1099Schema = z.object({
  payer: z.string().default(''),
  box1: money0,
  box3: money0,
  box4: money0,
  box8: money0,
  /** Set for interest from a foreign bank (no 1099 issued): makes it foreign source income for Form 1116. */
  foreignCountry: z.string().default(''),
  /** Foreign income tax withheld on this interest, in US dollars. */
  foreignTaxPaid: money0,
});

export const Div1099Schema = z.object({
  payer: z.string().default(''),
  box1a: money0,
  box1b: money0,
  box2a: money0,
  box4: money0,
  box5: money0,
  box7: money0,
  /** Foreign-source portion of box 1a from the broker's supplemental statement. 0 means use box 1a when box 7 is set. */
  foreignSourceDividends: money0,
});

export const LotSchema = z.object({
  description: z.string().default(''),
  dateAcquired: z.string().default(''),
  dateSold: z.string().default(''),
  proceeds: money,
  basis: money,
  /** Form 8949 column (f) code, e.g. W for wash sale. */
  adjustmentCode: z.string().default(''),
  /** Form 8949 column (g). Positive increases gain (wash sale disallowed loss). */
  adjustment: money0,
  term: z.enum(['short', 'long']),
  /** Basis reported to the IRS on 1099-B: box A/D if true, B/E if false. */
  basisReported: z.boolean().default(true),
  /** False when no 1099-B was issued at all (box C/F), e.g. foreign property. */
  reportedOn1099B: z.boolean().default(true),
});

/**
 * Sale of property acquired by inheritance (IRC 1014: basis is the fair
 * market value at the date of death, holding period is long-term). Amounts
 * are in the property's currency with the spot rate for each date.
 */
export const InheritedPropertySchema = z.object({
  description: z.string().default(''),
  owner,
  country: z.string().default(''),
  dateOfDeath: z.string().default(''),
  dateSold: z.string().default(''),
  currency: z.string().default('USD'),
  /** Fair market value at the date of death, in the property currency. */
  fmvAtDeath: money0,
  /** Units of the property currency per 1 USD on the date of death. */
  rateAtDeath: z.number().positive().default(1),
  salePrice: money0,
  /** Units per 1 USD on the sale date; also applied to selling costs. */
  rateAtSale: z.number().positive().default(1),
  /** Commissions, transfer taxes, legal fees of the sale, in the property currency. */
  sellingCosts: money0,
  /** Foreign capital gains tax actually paid in the tax year, in the property currency. */
  foreignTaxPaid: money0,
  /** Units per 1 USD on the date the foreign tax was paid. */
  rateAtTaxPayment: z.number().positive().default(1),
});

/** Gift or bequest from a foreign person, for Form 3520 Part IV. */
export const ForeignGiftSchema = z.object({
  date: z.string().default(''),
  description: z.string().default(''),
  donorName: z.string().default(''),
  donorType: z.enum(['individual', 'estate', 'corporation', 'partnership']).default('individual'),
  donorCountry: z.string().default(''),
  currency: z.string().default('USD'),
  /** Fair market value when received, in the gift currency. */
  amount: money0,
  /** Units per 1 USD on the date received. */
  rate: z.number().positive().default(1),
});

/**
 * A foreign financial account for FinCEN Form 114 (FBAR) and Schedule B Part III.
 * Values are in the account currency; the engine converts at the Treasury
 * year-end rate the user enters (foreign units per 1 USD, 1 for USD).
 */
export const ForeignAccountSchema = z.object({
  institution: z.string().default(''),
  accountNumber: z.string().default(''),
  accountType: z.enum(['bank', 'securities', 'other']).default('bank'),
  /** Description when accountType is other (e.g. pension, insurance). */
  otherTypeDescription: z.string().default(''),
  street: z.string().default(''),
  city: z.string().default(''),
  stateProvince: z.string().default(''),
  postalCode: z.string().default(''),
  /** Country where the account is held (name as FinCEN lists it). */
  country: z.string().default(''),
  /** taxpayer or spouse alone, or joint between the two spouses. */
  owner: z.enum(['taxpayer', 'spouse', 'joint']).default('taxpayer'),
  /** A joint owner other than the spouse (puts the account in Part III). */
  otherJointOwner: z.object({ name: z.string().default(''), tin: z.string().default(''), address: z.string().default('') }).optional(),
  /** Signature authority only, no financial interest (Part IV). */
  signatureAuthorityOnly: z.boolean().default(false),
  /** ISO 4217 code of the account currency. */
  currency: z.string().default('USD'),
  /** Highest balance during the calendar year, in the account currency. */
  maxValue: money0,
  /** FinCEN box 15a: the maximum value could not be determined. */
  maxValueUnknown: z.boolean().default(false),
  /** Treasury Reporting Rate of Exchange on December 31: foreign units per 1 USD. */
  treasuryRate: z.number().positive().default(1),
  /** Balance on December 31 in the account currency, for the Form 8938 last-day test. Omit to assume the maximum. */
  yearEndValue: money.optional(),
  openedThisYear: z.boolean().default(false),
  closedThisYear: z.boolean().default(false),
});

export const ScheduleCSchema = z.object({
  name: z.string().default(''),
  owner,
  grossReceipts: money0,
  returnsAndAllowances: money0,
  costOfGoodsSold: money0,
  /** Total of lines 8 through 27b plus line 30. */
  expenses: money0,
});

export const TaxReturnSchema = z.object({
  taxYear: z.union([z.literal(2025), z.literal(2026)]),
  filingStatus: FilingStatusSchema,
  taxpayer: PersonSchema.default({}),
  spouse: PersonSchema.optional(),
  dependents: z.array(DependentSchema).default([]),
  w2s: z.array(W2Schema).default([]),
  int1099s: z.array(Int1099Schema).default([]),
  div1099s: z.array(Div1099Schema).default([]),
  lots: z.array(LotSchema).default([]),
  capitalLossCarryover: z.object({ shortTerm: money0, longTerm: money0 }).default({}),
  scheduleC: z.array(ScheduleCSchema).default([]),
  foreignAccounts: z.array(ForeignAccountSchema).default([]),
  inheritedProperty: z.array(InheritedPropertySchema).default([]),
  foreignGifts: z.array(ForeignGiftSchema).default([]),
  /** auto: claim foreign tax directly on Schedule 3 when the $300/$600 election is available, else Form 1116. */
  foreignTaxCreditMethod: z.enum(['auto', 'form1116']).default('auto'),
  /** Unused passive-category foreign tax credit carried in from earlier years (Form 1116 line 10). */
  foreignTaxCreditCarryover: money0,
  /** California Form 540. */
  california: z
    .object({
      /** auto files when any W-2 shows state CA. */
      file: z.enum(['auto', 'yes', 'no']).default('auto'),
      /** Paid rent on a California principal residence for at least half the year (renter's credit). */
      rentedPrincipalResidence: z.boolean().default(false),
      /** Everyone on the return had health coverage all year (line 92). */
      fullYearHealthCoverage: z.boolean().default(true),
      estimatedPayments: money0,
      /** California capital loss carryover when it differs from the federal one. */
      capitalLossCarryover: z.object({ shortTerm: money0, longTerm: money0 }).optional(),
      /** Interest on municipal bonds from other states: federally exempt, taxable in California. */
      taxExemptInterestNonCalifornia: money0,
      otherAdditions: money0,
      otherSubtractions: money0,
    })
    .default({}),
  adjustments: z
    .object({
      hsaDeduction: money0,
      iraDeduction: money0,
      studentLoanInterest: money0,
      other: money0,
    })
    .default({}),
  itemized: z
    .object({
      medical: money0,
      /** State/local income tax paid beyond W-2 box 17 (estimates, prior-year balance). */
      stateLocalIncomeTaxOther: money0,
      realEstateTax: money0,
      personalPropertyTax: money0,
      mortgageInterest: money0,
      charityCash: money0,
      charityNoncash: money0,
      other: money0,
    })
    .default({}),
  /** auto takes the larger of standard and itemized; the other two force the choice. */
  deductionMethod: z.enum(['auto', 'standard', 'itemized']).default('auto'),
  /** Older files: equivalent to deductionMethod standard. */
  forceStandardDeduction: z.boolean().default(false),
  schedule1A: z
    .object({
      carLoanInterest: money0,
    })
    .default({}),
  payments: z
    .object({
      estimated: money0,
      extension: money0,
      otherWithholding: money0,
    })
    .default({}),
});

export type TaxReturn = z.infer<typeof TaxReturnSchema>;
export type FilingStatus = z.infer<typeof FilingStatusSchema>;
export type W2 = z.infer<typeof W2Schema>;
export type Lot = z.infer<typeof LotSchema>;
export type Dependent = z.infer<typeof DependentSchema>;
export type ForeignAccount = z.infer<typeof ForeignAccountSchema>;
export type InheritedProperty = z.infer<typeof InheritedPropertySchema>;
export type ForeignGift = z.infer<typeof ForeignGiftSchema>;

export const parseReturn = (raw: unknown): TaxReturn => TaxReturnSchema.parse(raw);
