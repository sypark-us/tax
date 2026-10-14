import { max0, pct, r, sum } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';
import type { TaxReturn } from '../model';

export interface ScheduleA {
  line1: number; line2: number; line3: number; line4: number;
  line5a: number; line5b: number; line5c: number; line5d: number; line5e: number;
  saltCapApplied: number;
  line7: number;
  line8a: number; line10: number;
  line11: number; line12: number; line14: number;
  charityFloor: number;
  line16: number;
  line17: number;
}

export const scheduleA = (ret: TaxReturn, agi: number, fs: FilingStatus, p: TaxParams): ScheduleA => {
  const ps = paramStatus(fs);
  const it = ret.itemized;

  const line1 = r(it.medical);
  const line2 = agi;
  const line3 = pct(line2, p.medicalFloorRate);
  const line4 = max0(line1 - line3);

  const line5a = sum(ret.w2s.map((w) => r(w.box17))) + r(it.stateLocalIncomeTaxOther);
  const line5b = r(it.realEstateTax);
  const line5c = r(it.personalPropertyTax);
  const line5d = line5a + line5b + line5c;
  const s = p.salt;
  const saltCapApplied = Math.max(s.floor[ps], s.cap[ps] - pct(max0(agi - s.phaseoutStart[ps]), s.phaseoutRate));
  const line5e = Math.min(line5d, saltCapApplied);
  const line7 = line5e;

  const line8a = r(it.mortgageInterest);
  const line10 = line8a;

  const line11 = r(it.charityCash);
  const line12 = r(it.charityNoncash);
  const charityFloor = pct(agi, p.charity.itemizedFloorRate);
  const line14 = max0(line11 + line12 - charityFloor);

  const line16 = r(it.other);
  const line17 = line4 + line7 + line10 + line14 + line16;

  return {
    line1, line2, line3, line4,
    line5a, line5b, line5c, line5d, line5e, saltCapApplied,
    line7, line8a, line10, line11, line12, line14, charityFloor, line16, line17,
  };
};
