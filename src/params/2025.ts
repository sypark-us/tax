import type { TaxParams, Bracket } from './types';

const b = (...edges: number[]): Bracket[] => {
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  return rates.map((rate, i) => ({ upTo: i < edges.length ? edges[i]! : null, rate }));
};

const same = <T>(v: T) => ({ single: v, mfj: v, mfs: v, hoh: v });

/**
 * Tax year 2025 (returns filed in 2026).
 * Inflation figures: Rev. Proc. 2024-40. OBBBA (P.L. 119-21) changes for
 * 2025: standard deduction, CTC $2,200, SALT $40,000, Schedule 1-A deductions.
 */
export const params2025: TaxParams = {
  year: 2025,
  brackets: {
    single: b(11_925, 48_475, 103_350, 197_300, 250_525, 626_350),
    mfj: b(23_850, 96_950, 206_700, 394_600, 501_050, 751_600),
    mfs: b(11_925, 48_475, 103_350, 197_300, 250_525, 375_800),
    hoh: b(17_000, 64_850, 103_350, 197_300, 250_500, 626_350),
  },
  standardDeduction: { single: 15_750, mfj: 31_500, mfs: 15_750, hoh: 23_625 },
  additionalStandardDeduction: { married: 1_600, unmarried: 2_000 },
  ltcg: {
    single: { zeroCeiling: 48_350, fifteenCeiling: 533_400 },
    mfj: { zeroCeiling: 96_700, fifteenCeiling: 600_050 },
    mfs: { zeroCeiling: 48_350, fifteenCeiling: 300_000 },
    hoh: { zeroCeiling: 64_750, fifteenCeiling: 566_700 },
  },
  ctc: {
    perChild: 2_200,
    refundableMax: 1_700,
    otherDependent: 500,
    phaseoutStart: { single: 200_000, mfj: 400_000, mfs: 200_000, hoh: 200_000 },
    earnedIncomeFloor: 2_500,
    refundableRate: 0.15,
  },
  salt: {
    cap: { single: 40_000, mfj: 40_000, mfs: 20_000, hoh: 40_000 },
    phaseoutStart: { single: 500_000, mfj: 500_000, mfs: 250_000, hoh: 500_000 },
    phaseoutRate: 0.3,
    floor: { single: 10_000, mfj: 10_000, mfs: 5_000, hoh: 10_000 },
  },
  capitalLossLimit: { single: 3_000, mfj: 3_000, mfs: 1_500, hoh: 3_000 },
  additionalMedicare: {
    rate: 0.009,
    threshold: { single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000 },
  },
  niit: { rate: 0.038, threshold: { single: 200_000, mfj: 250_000, mfs: 125_000, hoh: 200_000 } },
  socialSecurityWageBase: 176_100,
  seTax: { ssRate: 0.124, medicareRate: 0.029, netEarningsFactor: 0.9235, minimum: 400 },
  foreignTaxCreditDirectLimit: { single: 300, mfj: 600, mfs: 300, hoh: 300 },
  foreignGiftCorporateThreshold: 20_116,
  qbi: { rate: 0.2, threshold: { single: 197_300, mfj: 394_600, mfs: 197_300, hoh: 197_300 } },
  hsa: { self: 4_300, family: 8_550, catchUp: 1_000 },
  medicalFloorRate: 0.075,
  schedule1A: {
    senior: 6_000,
    seniorPhaseoutStart: { single: 75_000, mfj: 150_000, mfs: 75_000, hoh: 75_000 },
    seniorPhaseoutRate: 0.06,
    tipsMax: 25_000,
    overtimeMax: { single: 12_500, mfj: 25_000, mfs: 12_500, hoh: 12_500 },
    tipsOvertimePhaseoutStart: { single: 150_000, mfj: 300_000, mfs: 150_000, hoh: 150_000 },
    tipsOvertimePhaseoutPer1000: 100,
    carLoanMax: 10_000,
    carLoanPhaseoutStart: { single: 100_000, mfj: 200_000, mfs: 100_000, hoh: 100_000 },
    carLoanPhaseoutPer1000: 200,
  },
  charity: { nonItemizerCash: same(0), itemizedFloorRate: 0 },
  itemizedLimitationFor37Bracket: false,
  unverified: ['foreignGiftCorporateThreshold'],
  sources: {
    brackets: 'Rev. Proc. 2024-40 sec. 3.01',
    standardDeduction: 'OBBBA sec. 70102; IRS 2025 Form 1040 instructions',
    ltcg: 'Rev. Proc. 2024-40 sec. 3.03',
    ctc: 'OBBBA sec. 70104; IRC 24',
    salt: 'OBBBA sec. 70120; IRC 164(b)(6)',
    schedule1A: 'OBBBA secs. 70201-70203, 70103; IRC 224, 225, 163(h)(4), 151',
    foreignGiftCorporateThreshold: 'Rev. Proc. 2024-40 (IRC 6039F); secondary sources only, confirm at IRS.gov/InflationAdjustment',
  },
};
