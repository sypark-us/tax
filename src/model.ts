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
});

export const Div1099Schema = z.object({
  payer: z.string().default(''),
  box1a: money0,
  box1b: money0,
  box2a: money0,
  box4: money0,
  box5: money0,
  box7: money0,
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

export const parseReturn = (raw: unknown): TaxReturn => TaxReturnSchema.parse(raw);
