import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeReturn } from '../src/engine';
import { parseReturn } from '../src/model';

/**
 * Reconciliation against the household's filed 2025 return. The data file is
 * private and git-ignored, so this suite is skipped when it is absent.
 */
const file = new URL('../data/2025-actual.json', import.meta.url);

describe.skipIf(!existsSync(file))('filed 2025 joint return', () => {
  const c = computeReturn(parseReturn(JSON.parse(readFileSync(file, 'utf8'))));
  const f = c.f1040;

  it('matches the filed income lines', () => {
    expect(f.line1a).toBe(395_406);
    expect(f.line2b).toBe(27_711);
    expect(f.line3a).toBe(19_099);
    expect(f.line3b).toBe(30_781);
    expect(f.line7).toBe(453);
    expect(f.line8).toBe(-9_298);
    expect(f.line9).toBe(445_053);
    expect(f.line10).toBe(7_550);
    expect(f.line11).toBe(437_503);
  });

  it('matches the filed deductions and taxable income', () => {
    expect(c.scheduleA.line5e).toBe(33_250);
    expect(f.line12IsItemized).toBe(true);
    expect(f.line12).toBe(43_278);
    expect(f.line13a).toBe(69);
    expect(f.line14).toBe(43_347);
    expect(f.line15).toBe(394_156);
  });

  it('matches the filed tax and credits', () => {
    expect(f.line16).toBe(78_532);
    expect(f.line20).toBe(296);
    expect(f.line22).toBe(78_236);
    expect(f.line25a).toBe(77_360);
  });

  it('matches the filed Schedule D and Form 8949 totals', () => {
    const D = c.scheduleD.f8949.find((x) => x.box === 'D')!;
    const E = c.scheduleD.f8949.find((x) => x.box === 'E')!;
    expect([D.proceeds, D.basis, D.gain]).toEqual([12_820, 12_367, 453]);
    expect([E.proceeds, E.basis, E.gain]).toEqual([18_000, 18_000, 0]);
    expect(c.scheduleD.line16).toBe(453);
  });

  it('finds items the filed return omitted', () => {
    // Form 8959: Medicare wages 455,645 exceed the $250,000 MFJ threshold.
    expect(c.f8959.line18).toBe(1_851);
    expect(c.f8959.line24).toBe(285);
    // Form 8960: NII 58,945 (interest + dividends + net gain), MAGI above $250,000.
    expect(c.f8960.line8).toBe(58_945);
    expect(c.f8960.line17).toBe(2_240);
    // Schedule 3 line 11: one spouse had two employers whose combined
    // Social Security withholding exceeded the annual maximum.
    expect(c.schedule3.line11).toBe(1_718);
    // Net effect versus the filed balance due of 876.
    expect(f.line37).toBe(876 + 1_851 - 285 + 2_240 - 1_718);
  });
});
