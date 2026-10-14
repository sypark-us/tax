/**
 * California personal income tax parameters (Form 540).
 *
 * 2025: FTB 2025 Personal Income Tax Booklet (Form 540 instructions, tax
 * rate schedules page 75, line 32 AGI Limitation Worksheet, Schedule CA
 * line 29 Itemized Deductions Worksheet, Nonrefundable Renter's Credit
 * Qualification Record).
 * 2026: FTB Tax News "2026 Indexing" (CCPI 3.4%): standard deduction,
 * exemption credits, renter's credit limits and rate schedules are the
 * published figures. The AGI phase-out thresholds for exemption credits
 * and itemized deductions were not in that release and are the 2025
 * amounts indexed by 3.4%, flagged unverified until the FTB posts the
 * complete 2026 amounts in late December 2026.
 */
import type { Bracket, ByStatus } from './types';

export interface CaParams {
  year: 2025 | 2026;
  brackets: ByStatus<Bracket[]>;
  /** Taxable income at or under this uses the tax table (midpoint of $100 ranges). */
  taxTableCeiling: number;
  standardDeduction: ByStatus;
  /** Per personal, senior and blind exemption. */
  personalExemptionCredit: number;
  dependentExemptionCredit: number;
  /** Form 540 line 32 AGI Limitation Worksheet: federal AGI thresholds. */
  exemptionPhaseoutStart: ByStatus;
  exemptionPhaseoutStep: ByStatus;
  exemptionPhaseoutPerStep: number;
  /** Schedule CA line 29: federal AGI above which itemized deductions are limited (6% of excess, max 80%). */
  itemizedLimitationStart: ByStatus;
  itemizedLimitationRate: number;
  itemizedLimitationMaxReduction: number;
  renterCredit: { amount: ByStatus; agiLimit: ByStatus };
  /** Behavioral (Mental) Health Services Tax: 1% of taxable income over $1,000,000. */
  behavioralHealthTax: { rate: number; threshold: number };
  medicalFloorRate: number;
  unverified: string[];
  sources: Record<string, string>;
}

const rates = [0.01, 0.02, 0.04, 0.06, 0.08, 0.093, 0.103, 0.113, 0.123];
const b = (...edges: number[]): Bracket[] => rates.map((rate, i) => ({ upTo: i < edges.length ? edges[i]! : null, rate }));

export const ca2025: CaParams = {
  year: 2025,
  brackets: {
    single: b(11_079, 26_264, 41_452, 57_542, 72_724, 371_479, 445_771, 742_953),
    mfs: b(11_079, 26_264, 41_452, 57_542, 72_724, 371_479, 445_771, 742_953),
    mfj: b(22_158, 52_528, 82_904, 115_084, 145_448, 742_958, 891_542, 1_485_906),
    hoh: b(22_173, 52_530, 67_716, 83_805, 98_990, 505_208, 606_251, 1_010_417),
  },
  taxTableCeiling: 100_000,
  standardDeduction: { single: 5_706, mfs: 5_706, mfj: 11_412, hoh: 11_412 },
  personalExemptionCredit: 153,
  dependentExemptionCredit: 475,
  exemptionPhaseoutStart: { single: 252_203, mfs: 252_203, mfj: 504_411, hoh: 378_310 },
  exemptionPhaseoutStep: { single: 2_500, mfs: 1_250, mfj: 2_500, hoh: 2_500 },
  exemptionPhaseoutPerStep: 6,
  itemizedLimitationStart: { single: 252_203, mfs: 252_203, mfj: 504_411, hoh: 378_310 },
  itemizedLimitationRate: 0.06,
  itemizedLimitationMaxReduction: 0.8,
  renterCredit: {
    amount: { single: 60, mfs: 60, mfj: 120, hoh: 120 },
    agiLimit: { single: 53_994, mfs: 53_994, mfj: 107_988, hoh: 107_988 },
  },
  behavioralHealthTax: { rate: 0.01, threshold: 1_000_000 },
  medicalFloorRate: 0.075,
  unverified: [],
  sources: {
    brackets: 'FTB 2025 Personal Income Tax Booklet, 2025 California Tax Rate Schedules (page 75)',
    standardDeduction: 'FTB 2025 booklet, Form 540 line 18',
    exemptionCredits: 'FTB 2025 booklet, Form 540 lines 7-11 and line 32 AGI Limitation Worksheet',
    itemizedLimitation: 'FTB 2025 Schedule CA (540) instructions, line 29 and Itemized Deductions Worksheet',
    renterCredit: 'FTB 2025 booklet, Nonrefundable Renter\'s Credit Qualification Record',
    behavioralHealthTax: 'FTB 2025 booklet, Form 540 line 62',
  },
};

const idx = (x: number): number => Math.round(x * 1.034);

export const ca2026: CaParams = {
  ...ca2025,
  year: 2026,
  brackets: {
    single: b(11_456, 27_157, 42_861, 59_498, 75_197, 384_109, 460_927, 768_213),
    mfs: b(11_456, 27_157, 42_861, 59_498, 75_197, 384_109, 460_927, 768_213),
    mfj: b(22_912, 54_314, 85_722, 118_996, 150_394, 768_218, 921_854, 1_536_426),
    hoh: b(22_927, 54_316, 70_018, 86_654, 102_356, 522_385, 626_864, 1_044_771),
  },
  standardDeduction: { single: 5_900, mfs: 5_900, mfj: 11_800, hoh: 11_800 },
  personalExemptionCredit: 158,
  dependentExemptionCredit: 491,
  exemptionPhaseoutStart: { single: idx(252_203), mfs: idx(252_203), mfj: idx(504_411), hoh: idx(378_310) },
  itemizedLimitationStart: { single: idx(252_203), mfs: idx(252_203), mfj: idx(504_411), hoh: idx(378_310) },
  renterCredit: {
    amount: { single: 60, mfs: 60, mfj: 120, hoh: 120 },
    agiLimit: { single: 55_830, mfs: 55_830, mfj: 111_660, hoh: 111_660 },
  },
  unverified: ['exemptionPhaseoutStart', 'itemizedLimitationStart'],
  sources: {
    ...ca2025.sources,
    brackets: 'FTB Tax News, 2026 Indexing (2026 California tax rate schedules)',
    standardDeduction: 'FTB Tax News, 2026 Indexing',
    exemptionCredits: 'FTB Tax News, 2026 Indexing; phase-out thresholds are 2025 x 1.034 pending the full release',
    itemizedLimitation: '2025 thresholds x 1.034 pending the full 2026 release',
    renterCredit: 'FTB Tax News, 2026 Indexing',
  },
};

const byYear: Record<number, CaParams> = { 2025: ca2025, 2026: ca2026 };
export const caParamsFor = (year: number): CaParams => {
  const p = byYear[year];
  if (!p) throw new Error(`No California parameters for tax year ${year}`);
  return p;
};
