import type { TaxParams, Bracket } from './types';
import { params2025 } from './2025';

const b = (...edges: number[]): Bracket[] => {
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  return rates.map((rate, i) => ({ upTo: i < edges.length ? edges[i]! : null, rate }));
};

/**
 * Tax year 2026 (returns filed in 2027).
 * Inflation figures: Rev. Proc. 2025-32 (IR-2025-103, Oct 9 2025).
 * Entries listed in `unverified` were taken from secondary summaries of the
 * Rev. Proc. and must be confirmed against the primary text before a final
 * return is printed.
 */
export const params2026: TaxParams = {
  ...params2025,
  year: 2026,
  brackets: {
    single: b(12_400, 50_400, 105_700, 201_775, 256_225, 640_600),
    mfj: b(24_800, 100_800, 211_400, 403_550, 512_450, 768_700),
    mfs: b(12_400, 50_400, 105_700, 201_775, 256_225, 384_350),
    hoh: b(17_700, 67_450, 105_700, 201_775, 256_200, 640_600),
  },
  standardDeduction: { single: 16_100, mfj: 32_200, mfs: 16_100, hoh: 24_150 },
  additionalStandardDeduction: { married: 1_650, unmarried: 2_050 },
  ltcg: {
    single: { zeroCeiling: 49_450, fifteenCeiling: 545_500 },
    mfj: { zeroCeiling: 98_900, fifteenCeiling: 613_700 },
    mfs: { zeroCeiling: 49_450, fifteenCeiling: 306_850 },
    hoh: { zeroCeiling: 66_200, fifteenCeiling: 579_600 },
  },
  ctc: { ...params2025.ctc, perChild: 2_200, refundableMax: 1_700 },
  salt: {
    cap: { single: 40_400, mfj: 40_400, mfs: 20_200, hoh: 40_400 },
    phaseoutStart: { single: 505_000, mfj: 505_000, mfs: 252_500, hoh: 505_000 },
    phaseoutRate: 0.3,
    floor: { single: 10_000, mfj: 10_000, mfs: 5_000, hoh: 10_000 },
  },
  socialSecurityWageBase: 184_500,
  qbi: { rate: 0.2, threshold: { single: 201_775, mfj: 403_550, mfs: 201_775, hoh: 201_775 } },
  hsa: { self: 4_400, family: 8_750, catchUp: 1_000 },
  foreignGiftCorporateThreshold: 20_573,
  charity: {
    nonItemizerCash: { single: 1_000, mfj: 2_000, mfs: 1_000, hoh: 1_000 },
    itemizedFloorRate: 0.005,
  },
  itemizedLimitationFor37Bracket: true,
  unverified: [
    'brackets.mfs',
    'brackets.hoh',
    'additionalStandardDeduction',
    'ltcg.fifteenCeiling',
    'ctc.refundableMax',
    'salt.mfs',
    'socialSecurityWageBase',
    'qbi.threshold',
    'hsa',
    'foreignGiftCorporateThreshold',
  ],
  sources: {
    brackets: 'Rev. Proc. 2025-32 sec. 3.01 (single and MFJ confirmed via IR-2025-103)',
    standardDeduction: 'IR-2025-103',
    ltcg: 'Rev. Proc. 2025-32 sec. 3.03 (zero-rate ceilings via secondary analysis)',
    ctc: 'IRC 24 as amended by OBBBA; indexed from 2026',
    salt: 'IRC 164(b)(6) as amended by OBBBA: $40,000 x 1.01, threshold $500,000 x 1.01',
    charity: 'OBBBA secs. 70424-70425; IRC 170(p), 170(b)(1)(I)',
    itemizedLimitationFor37Bracket: 'OBBBA sec. 70111; IRC 68',
    schedule1A: 'OBBBA secs. 70201-70203, 70103',
    foreignGiftCorporateThreshold: 'Rev. Proc. 2025-32 (IRC 6039F); secondary sources only, confirm at IRS.gov/InflationAdjustment',
  },
};
