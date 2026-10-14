export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';

/** Qualifying surviving spouse uses married-filing-jointly amounts everywhere. */
export type ParamStatus = Exclude<FilingStatus, 'qss'>;
export const paramStatus = (fs: FilingStatus): ParamStatus => (fs === 'qss' ? 'mfj' : fs);

export type ByStatus<T = number> = Record<ParamStatus, T>;

export interface Bracket {
  /** Upper bound of taxable income for this rate, null for the top bracket. */
  upTo: number | null;
  rate: number;
}

export interface TaxParams {
  year: 2025 | 2026;
  brackets: ByStatus<Bracket[]>;
  standardDeduction: ByStatus;
  /** Additional standard deduction per 65+/blind condition. */
  additionalStandardDeduction: { married: number; unmarried: number };
  /** Qualified dividends / long-term capital gain rate ceilings (taxable income). */
  ltcg: ByStatus<{ zeroCeiling: number; fifteenCeiling: number }>;
  ctc: {
    perChild: number;
    refundableMax: number;
    otherDependent: number;
    phaseoutStart: ByStatus;
    earnedIncomeFloor: number;
    refundableRate: number;
  };
  salt: {
    cap: ByStatus;
    phaseoutStart: ByStatus;
    phaseoutRate: number;
    floor: ByStatus;
  };
  capitalLossLimit: ByStatus;
  additionalMedicare: { rate: number; threshold: ByStatus };
  niit: { rate: number; threshold: ByStatus };
  socialSecurityWageBase: number;
  seTax: { ssRate: number; medicareRate: number; netEarningsFactor: number; minimum: number };
  foreignTaxCreditDirectLimit: ByStatus;
  /** Form 3520 line 55: gifts from foreign corporations or partnerships above this must be reported (IRC 6039F, indexed). */
  foreignGiftCorporateThreshold: number;
  qbi: { rate: number; threshold: ByStatus };
  hsa: { self: number; family: number; catchUp: number };
  medicalFloorRate: number;
  /** OBBBA Schedule 1-A deductions (effective 2025 through 2028). */
  schedule1A: {
    senior: number;
    seniorPhaseoutStart: ByStatus;
    seniorPhaseoutRate: number;
    tipsMax: number;
    overtimeMax: ByStatus;
    tipsOvertimePhaseoutStart: ByStatus;
    tipsOvertimePhaseoutPer1000: number;
    carLoanMax: number;
    carLoanPhaseoutStart: ByStatus;
    carLoanPhaseoutPer1000: number;
  };
  charity: {
    /** Above-the-line cash gift deduction for non-itemizers (2026+). */
    nonItemizerCash: ByStatus;
    /** Itemized charitable deductions reduced by this fraction of AGI (2026+). */
    itemizedFloorRate: number;
  };
  /** 2026+: itemized deductions reduced by 2/37 of the amount in the 37% bracket. */
  itemizedLimitationFor37Bracket: boolean;
  /** Parameter groups not yet confirmed against the primary IRS source. */
  unverified: string[];
  sources: Record<string, string>;
}
