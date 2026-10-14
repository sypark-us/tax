/**
 * Layout-tolerant parsers for tax documents, working on positioned text
 * items from a PDF. The rule that holds across every W-2 and 1099 layout
 * seen so far: a box's value sits directly below its printed label (or, on
 * consolidated brokerage statements, to the right on the same row).
 */

export interface TextItem {
  str: string;
  x: number;
  y: number;
  page: number;
}

export type DocType = 'w2' | '1099-int' | '1099-div' | '1099-b' | '1040' | 'unknown';

const NUM = /^\$?\s?-?\(?\d[\d,]*\.\d{2}\)?-?$/;

export const toNumber = (s: string): number => {
  const t = s.trim();
  const neg = t.startsWith('-') || t.endsWith('-') || t.startsWith('(') || t.startsWith('$-');
  const n = parseFloat(t.replace(/[^\d.]/g, ''));
  return neg ? -n : n;
};

const clean = (s: string): string => s.replace(/[’‘]/g, "'").trim();

const byReadingOrder = (a: TextItem, b: TextItem): number => a.page - b.page || b.y - a.y || a.x - b.x;

const findLabel = (items: TextItem[], re: RegExp): TextItem | undefined =>
  items.filter((i) => re.test(clean(i.str))).sort(byReadingOrder)[0];

interface Near {
  dy?: number;
  dxLeft?: number;
  dxRight?: number;
}

const numberBelow = (items: TextItem[], label: TextItem | undefined, near: Near = {}): number | undefined => {
  if (!label) return undefined;
  const { dy = 55, dxLeft = 15, dxRight = 230 } = near;
  const c = items
    .filter((i) => i.page === label.page && NUM.test(i.str.trim()) && i.y < label.y - 3 && label.y - i.y <= dy && i.x >= label.x - dxLeft && i.x <= label.x + dxRight)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  return c[0] ? toNumber(c[0].str) : undefined;
};

const numberRight = (items: TextItem[], label: TextItem | undefined, dxRight = 420): number | undefined => {
  if (!label) return undefined;
  const c = items
    .filter((i) => i.page === label.page && NUM.test(i.str.trim()) && Math.abs(i.y - label.y) <= 2 && i.x > label.x && i.x - label.x <= dxRight)
    .sort((a, b) => a.x - b.x);
  return c[0] ? toNumber(c[0].str) : undefined;
};

const textBelow = (items: TextItem[], label: TextItem | undefined, accept: RegExp, near: Near = {}): string | undefined => {
  if (!label) return undefined;
  const { dy = 40, dxLeft = 15, dxRight = 260 } = near;
  const c = items
    .filter((i) => i.page === label.page && accept.test(clean(i.str)) && !NUM.test(i.str.trim()) && i.y < label.y - 3 && label.y - i.y <= dy && i.x >= label.x - dxLeft && i.x <= label.x + dxRight)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  return c[0] ? clean(c[0].str) : undefined;
};

export const detectDocType = (items: TextItem[]): DocType => {
  const all = items.map((i) => clean(i.str)).join(' ');
  if (/Form\s*1040\b/.test(all) && /Individual Income Tax Return/.test(all)) return '1040';
  if (/1099-B\b/.test(all) || /Proceeds From Broker/i.test(all)) return '1099-b';
  if (/1099-DIV\b/.test(all) || /Dividends and Distributions/i.test(all)) return '1099-div';
  if (/1099-INT\b/.test(all) || /Interest Income/i.test(all)) return '1099-int';
  if (/\bW-2\b/.test(all) || /Wage and Tax Statement/i.test(all)) return 'w2';
  return 'unknown';
};

export interface ParsedW2 {
  type: 'w2';
  employer: string;
  ein: string;
  box1: number; box2: number; box3: number; box4: number; box5: number; box6: number;
  box12: Array<{ code: string; amount: number }>;
  state: string;
  box16: number; box17: number;
  missing: string[];
}

const BOX12_CODES = /^(A|B|C|D|E|F|G|H|J|K|L|M|N|P|Q|R|S|T|V|W|Y|Z|AA|BB|DD|EE|FF|GG|HH|II)$/;

export const parseW2 = (items: TextItem[]): ParsedW2 => {
  const missing: string[] = [];
  const grab = (name: string, re: RegExp, near?: Near): number => {
    const v = numberBelow(items, findLabel(items, re), near);
    if (v === undefined) missing.push(name);
    return v ?? 0;
  };
  const box1 = grab('box1', /^Wages, tips, other comp/i);
  const box2 = grab('box2', /^Federal income tax withheld/i);
  const box3 = grab('box3', /^Social security wages/i);
  const box4 = grab('box4', /^Social security tax withheld/i);
  const box5 = grab('box5', /^Medicare wages and tips/i);
  const box6 = grab('box6', /^Medicare tax withheld/i);
  const box16 = numberBelow(items, findLabel(items, /^State wages, tips/i), { dxLeft: 60, dxRight: 260 }) ?? 0;
  const box17 = numberBelow(items, findLabel(items, /^State income tax$/i), { dy: 70, dxLeft: 60, dxRight: 200 }) ?? 0;

  const employerLabel = findLabel(items, /^Employer'?s name, address, and ZIP code/i);
  const employer = textBelow(items, employerLabel, /[A-Za-z]{3,}/, { dy: 30 }) ?? '';
  const ein = items.map((i) => i.str.trim()).find((s) => /^\d{2}-\d{7}$/.test(s)) ?? '';
  const state = textBelow(items, findLabel(items, /^State$/), /^[A-Z]{2}$/, { dy: 40, dxLeft: 25, dxRight: 60 }) ?? '';

  const box12: Array<{ code: string; amount: number }> = [];
  const sorted = [...items].sort(byReadingOrder);
  for (const it of sorted) {
    const code = it.str.trim();
    if (!BOX12_CODES.test(code)) continue;
    const amt = sorted.find((j) => j.page === it.page && Math.abs(j.y - it.y) <= 2 && j.x > it.x && j.x - it.x <= 90 && NUM.test(j.str.trim()));
    if (!amt) continue;
    if (box12.some((b) => b.code === code)) continue;
    box12.push({ code, amount: toNumber(amt.str) });
  }

  return { type: 'w2', employer, ein, box1, box2, box3, box4, box5, box6, box12, state, box16, box17, missing };
};

export interface Parsed1099Int {
  type: '1099-int';
  payer: string;
  box1: number; box3: number; box4: number; box8: number;
  missing: string[];
}

const numberNear = (items: TextItem[], label: TextItem | undefined): number | undefined =>
  numberRight(items, label) ?? numberBelow(items, label, { dy: 70, dxLeft: 20, dxRight: 260 });

/** Payer names on 1099s are printed in capitals; label continuations and form boilerplate are not. */
const NAME_LIKE = /^[A-Z0-9][A-Z0-9 .,&'/-]*[A-Z.]$/;
const BOILERPLATE = /1099|W-2|OMB|FORM|COPY|CORRECTED|CALENDAR|PAYER|RECIPIENT|POSTAL|TELEPHONE|P\.?O\.? BOX/i;
const looksLikeName = (s: string): boolean => NAME_LIKE.test(s) && !BOILERPLATE.test(s) && /[A-Z]{3,}/.test(s);

const payerName = (items: TextItem[]): string => {
  const label = findLabel(items, /^PAYER'?S name/i);
  if (label) {
    const c = items
      .filter((i) => i.page === label.page && i.y < label.y - 3 && label.y - i.y <= 100 && i.x >= label.x - 15 && i.x <= label.x + 200 && looksLikeName(clean(i.str)))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    if (c[0]) return clean(c[0].str);
  }
  const first = [...items].sort(byReadingOrder).find((i) => looksLikeName(clean(i.str)));
  return first ? clean(first.str) : '';
};

export const parse1099Int = (items: TextItem[]): Parsed1099Int => {
  const missing: string[] = [];
  const grab = (name: string, re: RegExp, required: boolean): number => {
    const v = numberNear(items, findLabel(items, re));
    if (v === undefined && required) missing.push(name);
    return v ?? 0;
  };
  return {
    type: '1099-int',
    payer: payerName(items),
    box1: grab('box1', /^(1-?\s*)?Interest income$/, true),
    box3: grab('box3', /^(3-?\s*)?Interest on U\.?S\.? Savings Bonds/i, false),
    box4: grab('box4', /^(4-?\s*)?Federal income tax withheld/i, false),
    box8: grab('box8', /^(8-?\s*)?Tax-exempt interest/i, false),
    missing,
  };
};

export interface Parsed1099Div {
  type: '1099-div';
  payer: string;
  box1a: number; box1b: number; box2a: number; box4: number; box5: number; box7: number;
  missing: string[];
}

export const parse1099Div = (items: TextItem[]): Parsed1099Div => {
  const missing: string[] = [];
  const grab = (name: string, re: RegExp, required: boolean): number => {
    const v = numberNear(items, findLabel(items, re));
    if (v === undefined && required) missing.push(name);
    return v ?? 0;
  };
  return {
    type: '1099-div',
    payer: payerName(items),
    box1a: grab('box1a', /^(1a-?\s*)?Total ordinary dividends/i, true),
    box1b: grab('box1b', /^(1b-?\s*)?Qualified dividends/i, false),
    box2a: grab('box2a', /^(2a-?\s*)?Total capital gain distr/i, false),
    box4: grab('box4', /^(4-?\s*)?Federal income tax withheld/i, false),
    box5: grab('box5', /^(5-?\s*)?Section 199A dividends/i, false),
    box7: grab('box7', /^(7-?\s*)?Foreign tax paid/i, false),
    missing,
  };
};

export type ParsedDoc = ParsedW2 | Parsed1099Int | Parsed1099Div | { type: DocType; missing: string[]; message: string };

export const parseTaxDocument = (items: TextItem[]): ParsedDoc => {
  const type = detectDocType(items);
  switch (type) {
    case 'w2': return parseW2(items);
    case '1099-int': return parse1099Int(items);
    case '1099-div': return parse1099Div(items);
    case '1099-b': return { type, missing: [], message: 'Form 1099-B import is not implemented yet. Enter lots by hand or import the broker CSV.' };
    case '1040': return { type, missing: [], message: 'This is a filed Form 1040, not a source document.' };
    default: return { type, missing: [], message: 'Could not recognise this document as a W-2, 1099-INT or 1099-DIV.' };
  }
};
