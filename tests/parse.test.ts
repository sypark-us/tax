import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectDocType, lotFromParsed, normalizeItems, parse1099Int, parseTaxDocuments, parseW2, toNumber, type Parsed1099B, type Parsed1099Div, type Parsed1099Int, type Parsed1099Misc, type TextItem } from '../src/import/parse';
import { imageSize, wordsToItems } from '../src/import/ocr';
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

// ---------------------------------------------------------------------------
// Generic reader: phrases, consolidated statements, 1099-MISC, 1099-B tables
// ---------------------------------------------------------------------------

const word = (str: string, x: number, y: number, page = 1, w = str.length * 5, h = 8): TextItem => ({ str, x, y, page, w, h });

describe('normalizeItems', () => {
  it('joins adjacent words into phrases but keeps numbers and dates apart, and drops leader dots', () => {
    const items = [word('1a', 40, 500), word('Total', 52, 500), word('Ordinary', 80, 500), word('Dividends', 125, 500), word('.', 175, 500, 1, 2), word('.', 178, 500, 1, 2), word('1,234.56', 300, 500), word('01/02/25', 400, 500), word('far', 600, 500)];
    const out = normalizeItems(items).map((i) => i.str);
    expect(out).toEqual(['1a', 'Total Ordinary Dividends', '1,234.56', '01/02/25', 'far']);
  });
  it('leaves items without widths alone', () => {
    const items = [it_('1', 290, 740), it_('Wages, tips, other compensation', 300, 740)];
    expect(normalizeItems(items).map((i) => i.str)).toEqual(['1', 'Wages, tips, other compensation']);
  });
});

describe('consolidated statement', () => {
  // One file, four forms, each announced by a short heading; values to the right of the labels.
  const items: TextItem[] = [
    it_("Payer's Name and Address:", 480, 760), it_('EXAMPLE BROKERAGE LLC', 480, 748),
    it_('Form 1099-DIV', 40, 700), it_('2025 Dividends and Distributions', 300, 700),
    it_('1a Total Ordinary Dividends', 40, 680), it_('9,259.82', 316, 680), it_('6 Investment Expenses', 400, 680), it_('0.00', 690, 680),
    it_('1b Qualified Dividends', 40, 670), it_('614.81', 316, 670),
    it_('2a Total Capital Gain Distributions', 40, 660), it_('100.00', 316, 660),
    it_('4 Federal Income Tax Withheld', 40, 650), it_('0.00', 316, 650),
    it_('5 Section 199A Dividends', 40, 640), it_('6.24', 316, 640),
    it_('7 Foreign Tax Paid', 40, 630), it_('12.00', 316, 630),
    it_('Form 1099-INT', 40, 600), it_('2025 Interest Income', 300, 600),
    it_('1 Interest Income', 40, 580), it_('855.99', 316, 580),
    it_('3 Interest on U.S. Savings Bonds and Treas. Obligations', 40, 570), it_('50.00', 316, 570),
    it_('4 Federal Income Tax Withheld', 40, 560), it_('0.00', 316, 560),
    it_('8 Tax-Exempt Interest', 40, 550), it_('0.00', 316, 550),
    it_('Form 1099-MISC', 40, 500), it_('2025 Miscellaneous Information', 300, 500),
    it_('2 Royalties', 40, 480), it_('0.00', 316, 480), it_('16 State Tax Withheld', 400, 480), it_('0.00', 690, 480),
    it_('3 Other Income', 40, 470), it_('250.00', 316, 470),
    it_('4 Federal Income Tax Withheld', 40, 460), it_('0.00', 316, 460),
    it_('8 Substitute Payments in Lieu of Dividends or Interest', 40, 450), it_('0.00', 316, 450),
    // A second copy of the 1099-INT with the same values must not duplicate.
    it_('Form 1099-INT', 40, 300, 2), it_('1 Interest Income', 40, 280, 2), it_('855.99', 316, 280, 2),
    it_('3 Interest on U.S. Savings Bonds and Treas. Obligations', 40, 270, 2), it_('50.00', 316, 270, 2),
    it_('4 Federal Income Tax Withheld', 40, 260, 2), it_('0.00', 316, 260, 2), it_('8 Tax-Exempt Interest', 40, 250, 2), it_('0.00', 316, 250, 2),
    // 1099-B pages: Fidelity-style two-row header, description on its own line, totals.
    it_('FORM 1099-B*', 22, 700, 3), it_('2025 Proceeds from Broker and Barter Exchange Transactions', 175, 700, 3),
    it_('Long-term transactions for which basis is reported to the IRS --report on Form 8949 with Box D checked and/or Schedule D, Part II', 22, 680, 3),
    it_('1a Description of property, Stock or Other Symbol, CUSIP', 29, 640, 3),
    it_('Action', 29, 626, 3), it_('Quantity', 114, 626, 3), it_('1b Date', 148, 626, 3), it_('1c Date Sold', 193, 626, 3), it_('1d Proceeds', 288, 626, 3), it_('1e Cost or', 368, 626, 3), it_('1f Accrued', 438, 626, 3), it_('1g Wash Sale', 490, 626, 3), it_('Gain/Loss (-)', 557, 626, 3), it_('4 Federal', 640, 626, 3), it_('14 State', 706, 626, 3),
    it_('Acquired', 148, 616, 3), it_('or Disposed', 193, 616, 3), it_('Other Basis (b)', 351, 616, 3), it_('Market', 453, 616, 3), it_('Loss', 523, 616, 3), it_('Income Tax', 631, 616, 3), it_('16 State Tax', 691, 616, 3),
    it_('Discount', 446, 607, 3), it_('Disallowed', 501, 607, 3), it_('Withheld', 641, 607, 3), it_('Withheld', 705, 607, 3),
    it_('BANK OF AMERICA NA CD 4.85000% 02/08/202,', 27, 590, 3), it_('06051V7Z3', 208, 590, 3),
    it_('Redemption', 27, 575, 3), it_('10,000.000', 104, 575, 3), it_('02/06/24', 158, 575, 3), it_('02/07/25', 212, 575, 3), it_('10,000.00', 297, 575, 3), it_('10,000.00', 369, 575, 3), it_('0.00', 588, 575, 3),
    it_('VANGUARD S&P 500 ETF, VOO, 922908363', 27, 560, 3),
    it_('Sale', 27, 545, 3), it_('10.000', 110, 545, 3), it_('03/01/23', 158, 545, 3), it_('06/15/25', 212, 545, 3), it_('5,200.00', 300, 545, 3), it_('4,000.00', 372, 545, 3), it_('30.00', 525, 545, 3), it_('1,230.00', 580, 545, 3),
    it_('Sale', 27, 530, 3), it_('5.000', 110, 530, 3), it_('VARIOUS', 158, 530, 3), it_('06/16/25', 212, 530, 3), it_('2,600.00', 300, 530, 3), it_('2,100.00', 372, 530, 3), it_('500.00', 585, 530, 3),
    it_('- - - - - - - - - - - - - - - - - - -', 18, 522, 3),
    it_('TOTALS', 26, 510, 3), it_('17,800.00', 293, 512, 3), it_('16,100.00', 365, 512, 3), it_('0.00', 460, 512, 3), it_('30.00', 523, 512, 3), it_('1,730.00', 580, 512, 3),
    it_('Box D', 155, 495, 3), it_('Long-Term Realized Gain', 183, 495, 3), it_('1,730.00', 586, 495, 3),
    // Second 1099-B page: unknown holding period, basis not reported.
    it_('FORM 1099-B*', 22, 700, 4),
    it_('Transactions for which basis is not reported to the IRS and for which short-term or long-term determination is unknown (to Broker) --report on Form 8949 with Box B or E checked', 22, 680, 4),
    it_('Action', 29, 626, 4), it_('Quantity', 114, 626, 4), it_('1b Date Acquired', 148, 626, 4), it_('1c Date Sold', 193, 626, 4), it_('1d Proceeds', 288, 626, 4), it_('1e Cost or Other Basis', 368, 626, 4), it_('1g Wash Sale Loss Disallowed', 490, 626, 4), it_('Gain/Loss (-)', 557, 626, 4),
    it_('OLD STOCK CORP, OLD, 123456789', 27, 590, 4),
    it_('Sale', 27, 575, 4), it_('100.000', 104, 575, 4), it_('01/15/25', 158, 575, 4), it_('03/01/25', 212, 575, 4), it_('1,000.00', 297, 575, 4), it_('900.00', 372, 575, 4), it_('100.00', 585, 575, 4),
    it_('Sale', 27, 560, 4), it_('100.000', 104, 560, 4), it_('01/15/20', 158, 560, 4), it_('03/01/25', 212, 560, 4), it_('1,000.00', 297, 560, 4), it_('0.00', 588, 560, 4),
    it_('TOTALS', 26, 540, 4), it_('2,000.00', 293, 540, 4), it_('900.00', 365, 540, 4),
  ];
  const docs = parseTaxDocuments(items);
  it('finds every form once', () => {
    expect(docs.map((d) => d.type)).toEqual(['1099-div', '1099-int', '1099-misc', '1099-b']);
  });
  it('reads the box forms with values to the right of their labels', () => {
    const div = docs[0] as Parsed1099Div;
    expect([div.box1a, div.box1b, div.box2a, div.box4, div.box5, div.box7]).toEqual([9259.82, 614.81, 100, 0, 6.24, 12]);
    expect(div.payer).toBe('EXAMPLE BROKERAGE LLC');
    const int = docs[1] as Parsed1099Int;
    expect([int.box1, int.box3, int.box4, int.box6, int.box8]).toEqual([855.99, 50, 0, 0, 0]);
    const misc = docs[2] as Parsed1099Misc;
    expect([misc.box1, misc.box2, misc.box3, misc.box4, misc.box8]).toEqual([0, 0, 250, 0, 0]);
    expect(misc.missing).toEqual([]);
  });
  it('reads the 1099-B table: columns from a multi-row header, section from the title, description from the line above', () => {
    const b = docs[3] as Parsed1099B;
    expect(b.payer).toBe('EXAMPLE BROKERAGE LLC');
    expect(b.lots).toHaveLength(5);
    const [cd, voo1, voo2, old1, old2] = b.lots;
    expect(cd).toMatchObject({ description: 'BANK OF AMERICA NA CD 4.85000% 02/08/202, 06051V7Z3', quantity: 10000, dateAcquired: '2024-02-06', dateSold: '2025-02-07', proceeds: 10000, basis: 10000, gainLoss: 0, term: 'long', termKnown: true, basisReported: true, box: 'D', washSale: 0 });
    expect(voo1).toMatchObject({ description: 'VANGUARD S&P 500 ETF, VOO, 922908363', quantity: 10, dateAcquired: '2023-03-01', dateSold: '2025-06-15', proceeds: 5200, basis: 4000, washSale: 30, gainLoss: 1230, box: 'D' });
    expect(voo2).toMatchObject({ description: 'VANGUARD S&P 500 ETF, VOO, 922908363', dateAcquired: 'VARIOUS', dateSold: '2025-06-16', proceeds: 2600, basis: 2100, gainLoss: 500 });
    // Unknown holding period: taken from the dates, flagged; basis not reported.
    expect(old1).toMatchObject({ description: 'OLD STOCK CORP, OLD, 123456789', term: 'short', termKnown: false, basisReported: false, box: '', proceeds: 1000, basis: 900 });
    expect(old2).toMatchObject({ term: 'long', termKnown: false, basisReported: false, proceeds: 1000, basis: 0 });
    expect(b.totals).toEqual([{ page: 3, proceeds: 17800, basis: 16100, count: 3 }, { page: 4, proceeds: 2000, basis: 900, count: 2 }]);
    expect(b.missing).toEqual(['OLD STOCK CORP, OLD, 123456789 sold 2025-03-01: no cost basis on the statement']);
  });
  it('turns a statement row into a return-file lot with Form 8949 adjustments', () => {
    const b = docs[3] as Parsed1099B;
    expect(lotFromParsed(b.lots[1]!)).toEqual({ description: 'VANGUARD S&P 500 ETF, VOO, 922908363', dateAcquired: '2023-03-01', dateSold: '2025-06-15', proceeds: 5200, basis: 4000, adjustmentCode: 'W', adjustment: 30, term: 'long', basisReported: true, reportedOn1099B: true });
    expect(lotFromParsed(b.lots[0]!).adjustmentCode).toBe('');
  });
  it('flags a mismatch between the lots read and the printed total', () => {
    const short = items.filter((i) => !(i.page === 3 && i.y === 545));
    const b = parseTaxDocuments(short).find((d) => d.type === '1099-b') as Parsed1099B;
    expect(b.lots).toHaveLength(4);
    expect(b.missing.some((m) => m.includes('sum to proceeds 12600.00 but the statement total is 17800.00'))).toBe(true);
  });
});

describe('1099-B in a one-row layout with term and covered columns', () => {
  const items: TextItem[] = [
    it_('Form 1099-B', 40, 700), it_('Proceeds From Broker and Barter Exchange Transactions', 200, 700),
    it_('Short-term transactions', 40, 680),
    it_('Description', 40, 660), it_('Quantity', 200, 660), it_('Date Acquired', 250, 660), it_('Date Sold', 320, 660), it_('Proceeds', 390, 660), it_('Cost Basis', 450, 660), it_('Wash Sale Loss Disallowed', 510, 660), it_('Gain or Loss', 600, 660), it_('Term', 660, 660), it_('Covered', 700, 660),
    it_('ACME INC COM', 40, 640), it_('12', 200, 640), it_('03/03/2025', 250, 640), it_('04/04/2025', 320, 640), it_('1,200.00', 390, 640), it_('1,300.00', 450, 640), it_('100.00', 510, 640), it_('0.00', 600, 640), it_('Short', 660, 640), it_('Yes', 700, 640),
    it_('BETA ETF', 40, 625), it_('3', 200, 625), it_('2020-01-01', 250, 625), it_('2025-02-02', 320, 625), it_('300.00', 390, 625), it_('100.00', 450, 625), it_('200.00', 600, 625), it_('Long', 660, 625), it_('Noncovered', 700, 625),
  ];
  it('takes the description from the row and the term and coverage from their columns', () => {
    const b = parseTaxDocuments(items)[0] as Parsed1099B;
    expect(b.type).toBe('1099-b');
    expect(b.lots).toHaveLength(2);
    expect(b.lots[0]).toMatchObject({ description: 'ACME INC COM', quantity: 12, dateAcquired: '2025-03-03', dateSold: '2025-04-04', proceeds: 1200, basis: 1300, washSale: 100, term: 'short', termKnown: true, basisReported: true });
    expect(b.lots[1]).toMatchObject({ description: 'BETA ETF', dateAcquired: '2020-01-01', proceeds: 300, basis: 100, term: 'long', basisReported: false });
    expect(lotFromParsed(b.lots[0]!)).toMatchObject({ adjustmentCode: 'W', adjustment: 100 });
  });
});

describe('OCR words', () => {
  it('converts word boxes to page units with the y axis flipped', () => {
    const words = [{ text: 'Wages,', bbox: { x0: 100, y0: 200, x1: 160, y1: 220 }, confidence: 95 }, { text: 'junk', bbox: { x0: 0, y0: 0, x1: 10, y1: 10 }, confidence: 10 }];
    const out = wordsToItems(words, 2, 1224, 1584);
    expect(out).toEqual([{ str: 'Wages,', x: 50, y: (1584 - 220) / 2, w: 30, h: 10, page: 2 }]);
  });
  it('reads PNG and JPEG dimensions from the header', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x04, 0xc8, 0, 0, 0x06, 0x30, 8, 2, 0, 0, 0]);
    expect(imageSize(png)).toEqual({ width: 1224, height: 1584 });
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x06, 0x30, 0x04, 0xc8, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
    expect(imageSize(jpg)).toEqual({ width: 1224, height: 1584 });
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

const fidelity = 'C:/Users/hi2su/Downloads/2025-Cash-Management-Individual-TOD-3925-Consolidated-Form-1099.pdf';
describe.skipIf(!existsSync(fidelity))('real Fidelity consolidated 1099 (private, skipped when absent)', () => {
  it('splits into DIV, INT, MISC and B and reads the two CD redemptions', async () => {
    const docs = parseTaxDocuments(await extractTextItems(fidelity));
    expect(docs.map((d) => d.type)).toEqual(['1099-div', '1099-int', '1099-misc', '1099-b']);
    const div = docs[0] as Parsed1099Div;
    expect([div.box1a, div.box1b, div.box5]).toEqual([9259.82, 614.81, 6.24]);
    expect(div.payer).toBe('NATIONAL FINANCIAL SERVICES LLC');
    expect((docs[1] as Parsed1099Int).box1).toBe(855.99);
    const b = docs[3] as Parsed1099B;
    expect(b.lots.map((l) => [l.proceeds, l.basis, l.term, l.box, l.dateAcquired, l.dateSold])).toEqual([[10000, 10000, 'long', 'D', '2024-02-06', '2025-02-07'], [18000, 18000, 'long', 'E', '2023-08-28', '2025-05-30']]);
    expect(b.lots[0]!.description).toMatch(/^BANK OF AMERICA NA CD/);
    expect(b.missing).toEqual([]);
  });
});
