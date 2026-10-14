import { r, sum, max0 } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';
import type { Lot } from '../model';

export interface F8949Part {
  box: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  rows: Array<{
    description: string;
    dateAcquired: string;
    dateSold: string;
    proceeds: number;
    basis: number;
    code: string;
    adjustment: number;
    gain: number;
  }>;
  proceeds: number;
  basis: number;
  adjustment: number;
  gain: number;
}

export interface ScheduleD {
  required: boolean;
  f8949: F8949Part[];
  line1a: F8949Part | null; // not used: we always route lots through 8949
  line1b: number; line2: number; line3: number;
  line6: number; line7: number;
  line8b: number; line9: number; line10: number;
  line13: number; line14: number; line15: number;
  line16: number;
  line21: number;
  /** Amount for Form 1040 line 7. */
  line7Form1040: number;
  nextYearCarryover: { shortTerm: number; longTerm: number };
}

const part = (box: F8949Part['box'], lots: Lot[]): F8949Part => {
  const rows = lots.map((l) => {
    const proceeds = r(l.proceeds);
    const basis = r(l.basis);
    const adjustment = r(l.adjustment);
    return {
      description: l.description,
      dateAcquired: l.dateAcquired,
      dateSold: l.dateSold,
      proceeds,
      basis,
      code: l.adjustmentCode,
      adjustment,
      gain: proceeds - basis + adjustment,
    };
  });
  return {
    box,
    rows,
    proceeds: sum(rows.map((x) => x.proceeds)),
    basis: sum(rows.map((x) => x.basis)),
    adjustment: sum(rows.map((x) => x.adjustment)),
    gain: sum(rows.map((x) => x.gain)),
  };
};

export const scheduleD = (
  lots: Lot[],
  carryover: { shortTerm: number; longTerm: number },
  capitalGainDistributions: number,
  fs: FilingStatus,
  p: TaxParams,
): ScheduleD => {
  const st = lots.filter((l) => l.term === 'short');
  const lt = lots.filter((l) => l.term === 'long');
  const parts: F8949Part[] = [];
  const A = part('A', st.filter((l) => l.basisReported));
  const B = part('B', st.filter((l) => !l.basisReported));
  const D = part('D', lt.filter((l) => l.basisReported));
  const E = part('E', lt.filter((l) => !l.basisReported));
  for (const x of [A, B, D, E]) if (x.rows.length) parts.push(x);

  const line1b = A.gain;
  const line2 = B.gain;
  const line3 = 0;
  const line6 = -max0(r(carryover.shortTerm));
  const line7 = line1b + line2 + line3 + line6;

  const line8b = D.gain;
  const line9 = E.gain;
  const line10 = 0;
  const line13 = r(capitalGainDistributions);
  const line14 = -max0(r(carryover.longTerm));
  const line15 = line8b + line9 + line10 + line13 + line14;

  const line16 = line7 + line15;
  const limit = p.capitalLossLimit[paramStatus(fs)];
  const line21 = line16 < 0 ? Math.max(line16, -limit) : 0;
  const line7Form1040 = line16 >= 0 ? line16 : line21;

  // Capital Loss Carryover Worksheet, simplified: assumes taxable income is
  // large enough that the full allowed loss is used this year.
  let nextST = 0;
  let nextLT = 0;
  if (line16 < 0) {
    const allowed = -line21;
    if (line7 < 0 && line15 < 0) {
      const stUsed = Math.min(allowed, -line7);
      nextST = -line7 - stUsed;
      nextLT = -line15 - (allowed - stUsed);
    } else if (line7 < 0) {
      nextST = -line7 - max0(line15) - allowed;
    } else {
      nextLT = -line15 - max0(line7) - allowed;
    }
  }

  const required = lots.length > 0 || carryover.shortTerm > 0 || carryover.longTerm > 0;

  return {
    required,
    f8949: parts,
    line1a: null,
    line1b, line2, line3, line6, line7,
    line8b, line9, line10, line13, line14, line15,
    line16, line21, line7Form1040,
    nextYearCarryover: { shortTerm: max0(nextST), longTerm: max0(nextLT) },
  };
};
