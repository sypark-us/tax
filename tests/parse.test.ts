import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectDocType, parse1099Int, parseW2, toNumber, type TextItem } from '../src/import/parse';
import { extractTextItems } from '../src/import/pdfText';

const it_ = (str: string, x: number, y: number, page = 1): TextItem => ({ str, x, y, page });

describe('toNumber', () => {
  it('parses dollar formats', () => {
    expect(toNumber('$26,062.87')).toBe(26062.87);
    expect(toNumber('794.65')).toBe(794.65);
    expect(toNumber('1141.00-')).toBe(-1141);
    expect(toNumber('(12.50)')).toBe(-12.5);
  });
});

describe('W-2 parser on a synthetic layout', () => {
  // Mimics the IRS layout: label row, values on the row beneath, a summary
  // table with a decoy number on the same row as a label.
  const items: TextItem[] = [
    it_('Wage and Tax Statement', 300, 100),
    it_("Employer's name, address, and ZIP code", 40, 700), it_('EXAMPLE EMPLOYER LLC', 40, 688),
    it_('12-3456789', 40, 740),
    it_('1', 290, 740), it_('Wages, tips, other compensation', 300, 740), it_('2', 420, 740), it_('Federal income tax withheld', 430, 740),
    it_('50000.00', 300, 728), it_('6000.00', 430, 728),
    it_('3', 290, 710), it_('Social security wages', 300, 710), it_('Reported', 380, 710), it_('99999.00', 500, 710),
    it_('4', 420, 710), it_('Social security tax withheld', 430, 710),
    it_('52000.00', 300, 698), it_('3224.00', 430, 698),
    it_('5', 290, 680), it_('Medicare wages and tips', 300, 680), it_('6', 420, 680), it_('Medicare tax withheld', 430, 680),
    it_('52000.00', 300, 668), it_('754.00', 430, 668),
    it_('12a', 500, 650), it_('D', 500, 638), it_('4000.00', 520, 638),
    it_('C', 500, 620), it_('o', 500, 610), it_('d', 500, 600),
    it_('15', 40, 400), it_('State', 50, 400), it_('16', 200, 400), it_('State wages, tips, etc.', 210, 400), it_('17', 300, 400), it_('State income tax', 310, 400),
    it_('CA', 50, 388), it_('123-456', 100, 388), it_('52000.00', 210, 388), it_('2500.00', 310, 388),
  ];
  const w = parseW2(items);
  it('detects and reads every box', () => {
    expect(detectDocType(items)).toBe('w2');
    expect([w.box1, w.box2, w.box3, w.box4, w.box5, w.box6]).toEqual([50000, 6000, 52000, 3224, 52000, 754]);
    expect(w.box12).toEqual([{ code: 'D', amount: 4000 }]);
    expect(w.state).toBe('CA');
    expect([w.box16, w.box17]).toEqual([52000, 2500]);
    expect(w.employer).toBe('EXAMPLE EMPLOYER LLC');
    expect(w.ein).toBe('12-3456789');
    expect(w.missing).toEqual([]);
  });
});

describe('1099-INT parser on a synthetic layout', () => {
  const items: TextItem[] = [
    it_("PAYER'S name, street address", 40, 700), it_('EXAMPLE BANK N.A.', 40, 680),
    it_('Form', 300, 700), it_('1099-INT', 330, 700),
    it_('1', 300, 650), it_('Interest income', 310, 650), it_('Interest Income', 400, 640), it_('$1,234.56', 310, 620),
    it_('4', 300, 560), it_('Federal income tax withheld', 310, 560), it_('$', 310, 540), it_('0.00', 320, 540),
  ];
  it('reads box 1 and the payer', () => {
    expect(detectDocType(items)).toBe('1099-int');
    const d = parse1099Int(items);
    expect(d.payer).toBe('EXAMPLE BANK N.A.');
    expect(d.box1).toBe(1234.56);
    expect(d.box4).toBe(0);
  });
});

const docs = 'C:/Users/hi2su/OneDrive/Documents/tax/2025/';
describe.skipIf(!existsSync(docs))('real 2025 documents (private, skipped when absent)', () => {
  it('ADP W-2', async () => {
    const w = parseW2(await extractTextItems(docs + '2025 W2.pdf'));
    expect([w.box1, w.box2, w.box3, w.box4, w.box5, w.box6]).toEqual([166986.19, 34855.76, 176100, 10918.2, 196225.44, 2845.27]);
    expect(w.box12).toEqual([{ code: 'D', amount: 29239.25 }, { code: 'W', amount: 6170.81 }, { code: 'DD', amount: 12675.88 }]);
    expect(w.state).toBe('CA');
    expect([w.box16, w.box17]).toEqual([173157, 14690.79]);
    expect(w.employer).toMatch(/MERGE HEALTHCARE/);
  });
  it('ADP W-2, second employer', async () => {
    const w = parseW2(await extractTextItems(docs + '2025 W2_hus.pdf'));
    expect([w.box1, w.box2, w.box5, w.box6, w.box17]).toEqual([200707.7, 37190.04, 231707.7, 3645.13, 16162.13]);
    expect(w.box12.map((b) => b.code).sort()).toEqual(['C', 'D', 'DD']);
  });
  it('IRS-layout W-2', async () => {
    const w = parseW2(await extractTextItems(docs + 'Sunyoung_Park_2025_W2_SYNTHESIS.pdf'));
    expect([w.box1, w.box2, w.box3, w.box4, w.box5, w.box6]).toEqual([27712.31, 5314.18, 27712.31, 1718.16, 27712.31, 401.83]);
    expect(w.box12).toEqual([{ code: 'DD', amount: 1125.92 }, { code: 'W', amount: 2287.7 }]);
    expect([w.state, w.box16, w.box17]).toEqual(['CA', 30000.01, 2396.67]);
    expect(w.employer).toMatch(/SYNTHESIS/);
  });
  it('1099-INT, two banks', async () => {
    const a = parse1099Int(await extractTextItems(docs + 'amex_int_2025.pdf'));
    expect(a.box1).toBe(794.65);
    expect(a.payer).toMatch(/AMERICAN EXPRESS/);
    const c = parse1099Int(await extractTextItems(docs + 'capital_one_1088_int.pdf'));
    expect(c.box1).toBe(26062.87);
    expect(c.payer).toMatch(/CAPITAL ONE/);
  });
});
