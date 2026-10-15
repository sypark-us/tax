import { max0, pct, r, sum } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';
import type { TaxReturn } from '../model';

export interface Schedule1A {
  tips: number;
  overtime: number;
  carLoanInterest: number;
  senior: number;
  total: number;
}

/** OBBBA deductions for tips, overtime, car-loan interest and seniors (2025-2028). Form 1040 line 13b. */
export const schedule1A = (ret: TaxReturn, magi: number, fs: FilingStatus, p: TaxParams): Schedule1A => {
  const ps = paramStatus(fs);
  const s = p.schedule1A;

  const tipsRaw = Math.min(sum(ret.w2s.map((w) => r(w.qualifiedTips))), s.tipsMax);
  const otRaw = Math.min(sum(ret.w2s.map((w) => r(w.qualifiedOvertime))), s.overtimeMax[ps]);
  const over = max0(magi - s.tipsOvertimePhaseoutStart[ps]);
  // Schedule 1-A lines 11 and 19: whole thousands, rounded down (the car-loan part rounds up).
  const tipsOtReduction = Math.floor(over / 1000) * s.tipsOvertimePhaseoutPer1000;
  const tips = max0(tipsRaw - tipsOtReduction);
  const overtime = max0(otRaw - tipsOtReduction);

  const carRaw = Math.min(r(ret.schedule1A.carLoanInterest), s.carLoanMax);
  const carOver = max0(magi - s.carLoanPhaseoutStart[ps]);
  const carLoanInterest = max0(carRaw - Math.ceil(carOver / 1000) * s.carLoanPhaseoutPer1000);

  const seniors = (ret.taxpayer.age65OrOlder ? 1 : 0) + (ret.spouse?.age65OrOlder ? 1 : 0);
  const seniorRaw = seniors * s.senior;
  const senior = max0(seniorRaw - pct(max0(magi - s.seniorPhaseoutStart[ps]), s.seniorPhaseoutRate));

  return { tips, overtime, carLoanInterest, senior, total: tips + overtime + carLoanInterest + senior };
};
