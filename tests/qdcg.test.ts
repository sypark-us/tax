import { describe, expect, it } from 'vitest';
import { qdcgWorksheet } from '../src/engine/qdcg';
import { paramsFor } from '../src/params';

const p25 = paramsFor(2025);

describe('Qualified Dividends and Capital Gain Tax Worksheet', () => {
  it('taxes qualified dividends and LTCG at 15% for a 24%-bracket MFJ filer', () => {
    const w = qdcgWorksheet(
      { taxableIncome: 394_156, qualifiedDividends: 19_099, schedDLine15: 453, schedDLine16: 453 },
      'mfj', p25,
    );
    expect(w.line4).toBe(19_552);
    expect(w.line5).toBe(374_604);
    expect(w.line9).toBe(0);
    expect(w.line17).toBe(19_552);
    expect(w.line18).toBe(2_933);
    expect(w.line22).toBe(75_599);
    expect(w.line25).toBe(78_532);
  });

  it('applies the 0% rate when ordinary income is below the ceiling', () => {
    const w = qdcgWorksheet({ taxableIncome: 60_000, qualifiedDividends: 10_000, line7: 0 }, 'mfj', p25);
    expect(w.line9).toBe(10_000);
    expect(w.line18).toBe(0);
    expect(w.line25).toBeLessThan(w.line24);
  });

  it('ignores capital gains when Schedule D shows a net loss', () => {
    const w = qdcgWorksheet(
      { taxableIncome: 100_000, qualifiedDividends: 0, schedDLine15: 2_000, schedDLine16: -1_000 },
      'single', p25,
    );
    expect(w.line3).toBe(0);
    expect(w.line25).toBe(w.line24);
  });

  it('never exceeds the ordinary tax', () => {
    for (let t = 0; t < 800_000; t += 9_973) {
      const w = qdcgWorksheet({ taxableIncome: t, qualifiedDividends: Math.min(t, 50_000), line7: 0 }, 'single', p25);
      expect(w.line25).toBeLessThanOrEqual(w.line24);
    }
  });
});
