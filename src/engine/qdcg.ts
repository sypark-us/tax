import { max0, pct } from '../money';
import { paramStatus, type FilingStatus, type TaxParams } from '../params';
import { ordinaryTax } from './brackets';

export interface QdcgInput {
  taxableIncome: number; // 1040 line 15
  qualifiedDividends: number; // 1040 line 3a
  /** Schedule D lines 15 and 16, or undefined when Schedule D is not filed. */
  schedDLine15?: number;
  schedDLine16?: number;
  /** 1040 line 7 when Schedule D is not required (capital gain distributions only). */
  line7?: number;
}

export interface QdcgWorksheet {
  line1: number; line2: number; line3: number; line4: number; line5: number;
  line6: number; line7: number; line8: number; line9: number; line10: number;
  line11: number; line12: number; line13: number; line14: number; line15: number;
  line16: number; line17: number; line18: number; line19: number; line20: number;
  line21: number; line22: number; line23: number; line24: number; line25: number;
}

/**
 * Qualified Dividends and Capital Gain Tax Worksheet (Form 1040 instructions,
 * line 16). Line numbers match the 2025 worksheet.
 */
export const qdcgWorksheet = (inp: QdcgInput, fs: FilingStatus, p: TaxParams): QdcgWorksheet => {
  const ps = paramStatus(fs);
  const line1 = inp.taxableIncome;
  const line2 = inp.qualifiedDividends;
  let line3: number;
  if (inp.schedDLine15 !== undefined && inp.schedDLine16 !== undefined) {
    line3 = inp.schedDLine15 > 0 && inp.schedDLine16 > 0 ? Math.min(inp.schedDLine15, inp.schedDLine16) : 0;
  } else {
    line3 = max0(inp.line7 ?? 0);
  }
  const line4 = line2 + line3;
  const line5 = max0(line1 - line4);
  const line6 = p.ltcg[ps].zeroCeiling;
  const line7 = Math.min(line1, line6);
  const line8 = Math.min(line5, line7);
  const line9 = line7 - line8;
  const line10 = Math.min(line1, line4);
  const line11 = line9;
  const line12 = line10 - line11;
  const line13 = p.ltcg[ps].fifteenCeiling;
  const line14 = Math.min(line1, line13);
  const line15 = line5 + line9;
  const line16 = max0(line14 - line15);
  const line17 = Math.min(line12, line16);
  const line18 = pct(line17, 0.15);
  const line19 = line9 + line17;
  const line20 = line10 - line19;
  const line21 = pct(line20, 0.2);
  const line22 = ordinaryTax(line5, fs, p);
  const line23 = line18 + line21 + line22;
  const line24 = ordinaryTax(line1, fs, p);
  const line25 = Math.min(line23, line24);
  return {
    line1, line2, line3, line4, line5, line6, line7, line8, line9, line10,
    line11, line12, line13, line14, line15, line16, line17, line18, line19, line20,
    line21, line22, line23, line24, line25,
  };
};
