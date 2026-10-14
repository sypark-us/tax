/**
 * Layout-tolerant readers for tax documents, working on positioned text
 * items. The items come from a PDF text layer (pdf.js) or from OCR of a
 * scanned page or photo; the readers do not care which.
 *
 * Nothing here is specific to one issuer. The rules that hold across every
 * layout seen so far:
 *  - a box's value sits to the right of its printed IRS label on the same
 *    row (consolidated statements) or directly below it (IRS-style forms);
 *  - a consolidated statement is several forms in one file, each announced
 *    by a short "Form 1099-XXX" heading;
 *  - 1099-B sale detail is a table whose columns are named by the IRS box
 *    labels (date acquired, date sold, proceeds, cost basis, wash sale,
 *    gain/loss) and whose sections say short/long-term and whether basis
 *    was reported (or name the Form 8949 box letter).
 */

export interface TextItem {
  str: string;
  x: number;
  y: number;
  page: number;
  /** Width and height in the same units as x/y, when the source knows them (pdf.js, OCR). */
  w?: number;
  h?: number;
}

export type DocType = 'w2' | '1099-int' | '1099-div' | '1099-misc' | '1099-b' | '1040' | 'unknown';

const NUM = /^\$?\s?-?\(?\d[\d,]*\.\d{2}\)?-?$/;
/** Looser than NUM: share counts (10,000.000), integers, negatives. */
const NUM_LOOSE = /^\(?-?\$?\d[\d,]*(\.\d+)?\)?-?$/;
const DATE = /^(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|various)$/i;
const LEADER = /^[.\-_·•x*]+$/i;
/** Box designators and W-2 box 12 codes ("12a", "c", "DD", "CA") stay their own cells so the readers can match them exactly. */
const DESIGNATOR = /^(\d{1,2}[a-z]?|[a-z]|[A-Z]{1,2})$/;

export const toNumber = (s: string): number => {
  const t = s.trim();
  const neg = t.startsWith('-') || t.endsWith('-') || t.startsWith('(') || t.startsWith('$-');
  const n = parseFloat(t.replace(/[^\d.]/g, ''));
  return neg ? -n : n;
};

const isNum = (s: string): boolean => NUM.test(s.trim());
const isNumLoose = (s: string): boolean => NUM_LOOSE.test(s.trim());
const isDate = (s: string): boolean => DATE.test(s.trim().replace(/,$/, ''));

const clean = (s: string): string => s.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
/** Drops a leading IRS box number ("1a ", "12 ", "Box 1 ") so label patterns need not know it. */
const labelText = (s: string): string => clean(s).replace(/^(box\s*)?(\d{1,2}[a-z]?|[a-z])[\s.:\-]+(?=[A-Za-z(])/, '').replace(/^box\s*\d{1,2}[a-z]?[\s.:\-]+(?=[A-Za-z(])/i, '');

export const byReadingOrder = (a: TextItem, b: TextItem): number => a.page - b.page || b.y - a.y || a.x - b.x;

/** Converts a date as printed (mm/dd/yy, mm/dd/yyyy, yyyy-mm-dd, VARIOUS) to yyyy-mm-dd when possible. */
export const isoDate = (s: string): string => {
  const t = s.trim().replace(/,$/, '');
  if (/^various$/i.test(t)) return 'VARIOUS';
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : t;
  const yy = m[3]!.length === 2 ? (Number(m[3]) >= 70 ? 1900 : 2000) + Number(m[3]) : Number(m[3]);
  return `${yy}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Rows and phrases
// ---------------------------------------------------------------------------

export interface Row {
  page: number;
  y: number;
  cells: TextItem[];
}

const rowTolerance = (items: TextItem[]): number => {
  const hs = items.map((i) => i.h ?? 0).filter((h) => h > 0).sort((a, b) => a - b);
  return hs.length ? Math.max(2.5, hs[hs.length >> 1]! * 0.45) : 2.5;
};

/** Groups items into rows (same page, nearly the same baseline), each row sorted left to right. */
export const toRows = (items: TextItem[]): Row[] => {
  const tol = rowTolerance(items);
  const sorted = [...items].sort(byReadingOrder);
  const rows: Row[] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tol) last.cells.push(it);
    else rows.push({ page: it.page, y: it.y, cells: [it] });
  }
  for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
  return rows;
};

/**
 * Joins words that sit next to each other on a row into one phrase, so OCR
 * word output and PDF text runs look alike. Numbers and dates are never
 * merged (they are values, not label text); leader dots are dropped.
 */
export const normalizeItems = (items: TextItem[]): TextItem[] => {
  const kept = items.filter((i) => i.str.trim() && !LEADER.test(i.str.trim()));
  const out: TextItem[] = [];
  for (const row of toRows(kept)) {
    let cur: TextItem | null = null;
    for (const it of row.cells) {
      const value = isNumLoose(it.str) || isDate(it.str) || DESIGNATOR.test(it.str.trim());
      const prev: TextItem | null = cur;
      if (prev && prev.w !== undefined && it.w !== undefined && !value && !isNumLoose(prev.str) && !isDate(prev.str) && !DESIGNATOR.test(prev.str.trim())) {
        const gap = it.x - (prev.x + prev.w);
        const unit = Math.max(prev.h ?? 0, it.h ?? 0, 6);
        if (gap >= -1 && gap < unit * 0.9) {
          const merged: TextItem = { ...prev, str: `${prev.str.trimEnd()} ${it.str.trimStart()}`, w: it.x + it.w - prev.x, h: Math.max(prev.h ?? 0, it.h ?? 0) };
          cur = merged;
          out[out.length - 1] = merged;
          continue;
        }
      }
      cur = { ...it };
      out.push(cur);
    }
  }
  return out;
};

const rowText = (row: Row): string => clean(row.cells.map((c) => c.str).join(' '));

// ---------------------------------------------------------------------------
// Label lookups (box-style forms)
// ---------------------------------------------------------------------------

const findLabel = (items: TextItem[], re: RegExp): TextItem | undefined =>
  items.filter((i) => re.test(labelText(i.str))).sort(byReadingOrder)[0];

interface Near {
  dy?: number;
  dxLeft?: number;
  dxRight?: number;
}

const numberBelow = (items: TextItem[], label: TextItem | undefined, near: Near = {}): number | undefined => {
  if (!label) return undefined;
  const { dy = 55, dxLeft = 15, dxRight = 230 } = near;
  const c = items
    .filter((i) => i.page === label.page && isNum(i.str) && i.y < label.y - 3 && label.y - i.y <= dy && i.x >= label.x - dxLeft && i.x <= label.x + dxRight)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  return c[0] ? toNumber(c[0].str) : undefined;
};

const numberRight = (items: TextItem[], label: TextItem | undefined, dxRight = 420): number | undefined => {
  if (!label) return undefined;
  const tol = Math.max(2, (label.h ?? 0) * 0.45);
  const c = items
    .filter((i) => i.page === label.page && isNum(i.str) && Math.abs(i.y - label.y) <= tol && i.x > label.x && i.x - label.x <= dxRight)
    .sort((a, b) => a.x - b.x);
  return c[0] ? toNumber(c[0].str) : undefined;
};

const textBelow = (items: TextItem[], label: TextItem | undefined, accept: RegExp, near: Near = {}): string | undefined => {
  if (!label) return undefined;
  const { dy = 40, dxLeft = 15, dxRight = 260 } = near;
  const c = items
    .filter((i) => i.page === label.page && accept.test(clean(i.str)) && !isNum(i.str) && i.y < label.y - 3 && label.y - i.y <= dy && i.x >= label.x - dxLeft && i.x <= label.x + dxRight)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  return c[0] ? clean(c[0].str) : undefined;
};

const numberNear = (items: TextItem[], label: TextItem | undefined): number | undefined =>
  numberRight(items, label) ?? numberBelow(items, label, { dy: 70, dxLeft: 20, dxRight: 260 });

// ---------------------------------------------------------------------------
// Document type and form regions
// ---------------------------------------------------------------------------

export const detectDocType = (items: TextItem[]): DocType => {
  const all = items.map((i) => clean(i.str)).join(' ');
  if (/Form\s*1040\b/.test(all) && /Individual Income Tax Return/.test(all)) return '1040';
  if (/1099-?B\b/.test(all) || /Proceeds From Broker/i.test(all)) return '1099-b';
  if (/1099-?MISC\b/i.test(all) || /Miscellaneous (Information|Income)/i.test(all)) return '1099-misc';
  if (/1099-?DIV\b/.test(all) || /Dividends and Distributions/i.test(all)) return '1099-div';
  if (/1099-?INT\b/.test(all) || /Interest Income/i.test(all)) return '1099-int';
  if (/\bW-?2\b/.test(all) || /Wage and Tax Statement/i.test(all)) return 'w2';
  return 'unknown';
};

/** A short heading that announces one form inside a file ("Form 1099-DIV", "FORM 1099-B*"). */
const markerType = (s: string): DocType | null => {
  const t = clean(s);
  if (t.length > 40) return null;
  const m = /^(form\s*)?1099-?\s?(int|div|misc|b)\b/i.exec(t);
  if (m) return `1099-${m[2]!.toLowerCase()}` as DocType;
  if (/^(form\s*)?w-?2\b/i.test(t) && !/w-?2g/i.test(t)) return 'w2';
  return null;
};

interface Region {
  type: DocType;
  items: TextItem[];
}

/** Splits a file into the forms it contains. A file without headings is one region of its detected type. */
export const splitRegions = (items: TextItem[]): Region[] => {
  const sorted = [...items].sort(byReadingOrder);
  const marks: Array<{ idx: number; type: DocType }> = [];
  sorted.forEach((it, idx) => {
    const t = markerType(it.str);
    if (t) marks.push({ idx, type: t });
  });
  const types = new Set(marks.map((m) => m.type));
  if (types.has('w2') || marks.length === 0) return [{ type: detectDocType(items), items: sorted }];
  // Consecutive headings of the same form (copy B then copy 2, or one per page) stay one region.
  const regions: Region[] = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i]!.idx;
    const end = i + 1 < marks.length ? marks[i + 1]!.idx : sorted.length;
    const slice = sorted.slice(start, end);
    const last = regions[regions.length - 1];
    if (last && last.type === marks[i]!.type) last.items.push(...slice);
    else regions.push({ type: marks[i]!.type, items: slice });
  }
  // Text before the first heading (payer block, summary) belongs with the first form for payer lookup.
  if (marks[0]!.idx > 0 && regions[0]) regions[0].items = [...sorted.slice(0, marks[0]!.idx), ...regions[0].items];
  return regions;
};

// ---------------------------------------------------------------------------
// W-2
// ---------------------------------------------------------------------------

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
  // "15 State" may be joined with the neighbouring "Employer's state ID number" heading.
  const state = (textBelow(items, findLabel(items, /^State\b(?!\s+(wages|income))/i), /^[A-Z]{2}(\s|$)/,{ dy: 40, dxLeft: 25, dxRight: 60 }) ?? '').slice(0, 2);

  const box12: Array<{ code: string; amount: number }> = [];
  const sorted = [...items].sort(byReadingOrder);
  for (const it of sorted) {
    const code = it.str.trim();
    if (!BOX12_CODES.test(code)) continue;
    const amt = sorted.find((j) => j.page === it.page && Math.abs(j.y - it.y) <= 2 && j.x > it.x && j.x - it.x <= 90 && isNum(j.str));
    if (!amt) continue;
    if (box12.some((b) => b.code === code)) continue;
    box12.push({ code, amount: toNumber(amt.str) });
  }

  return { type: 'w2', employer, ein, box1, box2, box3, box4, box5, box6, box12, state, box16, box17, missing };
};

// ---------------------------------------------------------------------------
// Payer
// ---------------------------------------------------------------------------

/** Payer names on 1099s are printed in capitals; label continuations and form boilerplate are not. */
const NAME_LIKE = /^[A-Z0-9][A-Z0-9 .,&'/-]*[A-Z.]$/;
const BOILERPLATE = /1099|W-2|OMB|FORM|COPY|CORRECTED|CALENDAR|PAYER|RECIPIENT|POSTAL|TELEPHONE|P\.?O\.? BOX|STATEMENT|ACCOUNT|SUMMARY|TOTAL|IMPORTANT|DELIVERED/i;
const looksLikeName = (s: string): boolean => NAME_LIKE.test(s) && !BOILERPLATE.test(s) && /[A-Z]{3,}/.test(s);

export const payerName = (items: TextItem[]): string => {
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

// ---------------------------------------------------------------------------
// Box-style 1099s
// ---------------------------------------------------------------------------

export interface Parsed1099Int {
  type: '1099-int';
  payer: string;
  box1: number; box3: number; box4: number; box6: number; box8: number;
  missing: string[];
}

export interface Parsed1099Div {
  type: '1099-div';
  payer: string;
  box1a: number; box1b: number; box2a: number; box4: number; box5: number; box7: number;
  missing: string[];
}

export interface Parsed1099Misc {
  type: '1099-misc';
  payer: string;
  box1: number; box2: number; box3: number; box4: number; box8: number;
  missing: string[];
}

type BoxSpec = Array<[name: string, label: RegExp, required: boolean]>;

const readBoxes = (items: TextItem[], spec: BoxSpec, payerItems: TextItem[]): { payer: string; boxes: Record<string, number>; missing: string[] } => {
  const missing: string[] = [];
  const boxes: Record<string, number> = {};
  for (const [name, re, required] of spec) {
    const v = numberNear(items, findLabel(items, re));
    if (v === undefined && required) missing.push(name);
    boxes[name] = v ?? 0;
  }
  return { payer: payerName(payerItems.length ? payerItems : items), boxes, missing };
};

const INT_SPEC: BoxSpec = [
  ['box1', /^Interest income$/i, true],
  ['box3', /^Interest on U\.?S\.? Savings Bonds/i, false],
  ['box4', /^Federal income tax withheld/i, false],
  ['box6', /^Foreign tax paid/i, false],
  ['box8', /^Tax-exempt interest/i, false],
];
const DIV_SPEC: BoxSpec = [
  ['box1a', /^Total ordinary dividends/i, true],
  ['box1b', /^Qualified dividends/i, false],
  ['box2a', /^Total capital gain distr/i, false],
  ['box4', /^Federal income tax withheld/i, false],
  ['box5', /^Section 199A dividends/i, false],
  ['box7', /^Foreign tax paid/i, false],
];
const MISC_SPEC: BoxSpec = [
  ['box1', /^Rents$/i, false],
  ['box2', /^Royalties$/i, false],
  ['box3', /^Other income$/i, false],
  ['box4', /^Federal income tax withheld/i, false],
  ['box8', /^Substitute payments in lieu/i, false],
];

export const parse1099Int = (items: TextItem[], payerItems: TextItem[] = []): Parsed1099Int => {
  const { payer, boxes, missing } = readBoxes(items, INT_SPEC, payerItems);
  return { type: '1099-int', payer, box1: boxes.box1!, box3: boxes.box3!, box4: boxes.box4!, box6: boxes.box6!, box8: boxes.box8!, missing };
};

export const parse1099Div = (items: TextItem[], payerItems: TextItem[] = []): Parsed1099Div => {
  const { payer, boxes, missing } = readBoxes(items, DIV_SPEC, payerItems);
  return { type: '1099-div', payer, box1a: boxes.box1a!, box1b: boxes.box1b!, box2a: boxes.box2a!, box4: boxes.box4!, box5: boxes.box5!, box7: boxes.box7!, missing };
};

export const parse1099Misc = (items: TextItem[], payerItems: TextItem[] = []): Parsed1099Misc => {
  const { payer, boxes, missing } = readBoxes(items, MISC_SPEC, payerItems);
  const m = [...missing];
  if ([boxes.box1, boxes.box2, boxes.box3, boxes.box8].every((v) => !v)) m.push('no amounts');
  return { type: '1099-misc', payer, box1: boxes.box1!, box2: boxes.box2!, box3: boxes.box3!, box4: boxes.box4!, box8: boxes.box8!, missing: m };
};

// ---------------------------------------------------------------------------
// 1099-B sale tables
// ---------------------------------------------------------------------------

export interface ParsedLot {
  description: string;
  quantity: number;
  dateAcquired: string;
  dateSold: string;
  proceeds: number;
  basis: number;
  /** Box 1f accrued market discount (Form 8949 code D, entered as a negative adjustment). */
  accruedDiscount: number;
  /** Box 1g wash sale loss disallowed (Form 8949 code W, positive adjustment). */
  washSale: number;
  gainLoss: number | undefined;
  federalWithheld: number;
  term: 'short' | 'long';
  /** False when the holding period could not be read; the term was derived from the dates or assumed. */
  termKnown: boolean;
  basisReported: boolean;
  /** Form 8949 box letter when the statement names it. */
  box: string;
  page: number;
}

export interface Parsed1099B {
  type: '1099-b';
  payer: string;
  lots: ParsedLot[];
  /** Totals printed by the broker, per section, when they could be read. */
  totals: Array<{ page: number; proceeds: number; basis: number | undefined; count: number }>;
  missing: string[];
}

type ColKey = 'action' | 'description' | 'quantity' | 'acquired' | 'sold' | 'proceeds' | 'basis' | 'accrued' | 'wash' | 'term' | 'covered' | 'state' | 'fedWithheld' | 'gain';

const COLS: Array<[ColKey, RegExp]> = [
  ['action', /\baction\b|transaction type|activity/i],
  ['description', /description|security|cusip|symbol/i],
  ['quantity', /quantity|shares|\bqty\b|units/i],
  ['acquired', /acqui|purchas|date\s*acq|\bopen/i],
  ['sold', /sold|dispos|sale date|date of sale|\bclos/i],
  ['proceeds', /proceed|sales? price|gross amount/i],
  ['accrued', /accrued|market discount/i],
  ['wash', /wash/i],
  ['term', /\bterm\b|holding period/i],
  ['covered', /covered|reported to/i],
  ['basis', /cost|basis/i],
  ['state', /\bstate\b/i],
  ['fedWithheld', /federal|withheld|tax w\/?h/i],
  ['gain', /gain|loss/i],
];

const classify = (text: string): ColKey | null => {
  for (const [key, re] of COLS) if (re.test(text)) return key;
  return null;
};

interface Column {
  key: ColKey;
  x: number;
  /** Left and right bounds of the column, in page units. */
  left: number;
  right: number;
}

/** Column anchors for a candidate header row, with header text gathered from neighbouring header rows. */
const headerColumns = (rows: Row[], anchorIdx: number): Column[] | null => {
  const anchor = rows[anchorIdx]!;
  if (anchor.cells.some((c) => isNum(c.str))) return null;
  const neighbours = rows.filter((r) => r.page === anchor.page && Math.abs(r.y - anchor.y) <= 32 && !r.cells.some((c) => isNum(c.str) || isDate(c.str)));
  const xs = anchor.cells.map((c) => c.x);
  // Header text for a column is every neighbouring header cell whose left edge is nearest that anchor.
  const nearest = (x: number): number => xs.reduce((best, ax, i) => (Math.abs(ax - x) < Math.abs(xs[best]! - x) ? i : best), 0);
  const texts: string[][] = xs.map(() => []);
  for (const r of neighbours) for (const n of r.cells) texts[nearest(n.x)]!.push(n.str);
  const cols: Column[] = anchor.cells.map((c, i) => ({ key: classify(texts[i]!.join(' ')) ?? ('' as ColKey), x: c.x, left: 0, right: 0 }));
  const found = cols.filter((c) => c.key);
  const keys = new Set(found.map((c) => c.key));
  if (!keys.has('proceeds') || ['acquired', 'sold', 'basis', 'gain', 'quantity'].filter((k) => keys.has(k as ColKey)).length < 2) return null;
  // Keep the first column found for each key; drop unclassified anchors.
  const seen = new Set<ColKey>();
  const out: Column[] = [];
  for (const c of cols) {
    if (!c.key || seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
  }
  // Rebuild bounds over the kept columns so values fall into the nearest named column.
  for (let i = 0; i < out.length; i++) {
    out[i]!.left = i === 0 ? -Infinity : out[i]!.x - 14;
    out[i]!.right = i + 1 < out.length ? out[i + 1]!.x - 14 : Infinity;
  }
  return out;
};

const cellCenter = (c: TextItem): number => c.x + (c.w !== undefined ? c.w / 2 : 12);

const columnOf = (cols: Column[], c: TextItem): Column | undefined => {
  const cx = cellCenter(c);
  return cols.find((k) => cx >= k.left && cx < k.right);
};

interface Section {
  term: 'short' | 'long' | null;
  basisReported: boolean;
  box: string;
}

const sectionFromText = (t: string): Section | null => {
  // "Box D" names the section; "Box B or E" means the broker could not tell, so no letter is kept.
  const boxes = [...t.matchAll(/\bBox\s+([A-F])\b(\s+or\s+[A-F]\b)?/gi)].map((m) => (m[2] ? '?' : m[1]!.toUpperCase()));
  const box = boxes.length === 1 && boxes[0] !== '?' ? boxes[0]! : '';
  const short = /short-?\s?term/i.test(t);
  const long = /long-?\s?term/i.test(t);
  const unknown = /unknown|undetermined|not determined/i.test(t);
  if (!box && !short && !long && !/basis\s+(is|was|has|were|are)?\s*(not\s+)?(been\s+)?reported|non-?covered|\bcovered\b/i.test(t)) return null;
  let term: Section['term'] = box ? ('ABC'.includes(box) ? 'short' : 'long') : short && !long ? 'short' : long && !short ? 'long' : null;
  if (unknown) term = null;
  const basisReported = box ? 'AD'.includes(box) : !/not\s+(been\s+)?reported|non-?covered|not available/i.test(t);
  return { term, basisReported, box };
};

const SEPARATOR = /^[\s\-_=.·]+$/;
const TOTALS = /^(sub-?)?totals?\b/i;

export const parse1099B = (items: TextItem[], payerItems: TextItem[] = []): Parsed1099B => {
  const rows = toRows(items);
  const lots: ParsedLot[] = [];
  const totals: Parsed1099B['totals'] = [];
  const missing: string[] = [];
  let section: Section = { term: null, basisReported: true, box: '' };
  let cols: Column[] | null = null;
  let page = -1;
  let headerY = NaN;
  let pendingDesc = '';
  let lastWasText = false;
  let blockLots: ParsedLot[] = [];
  let inBlock = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.page !== page) { page = row.page; cols = null; inBlock = false; }
    const text = rowText(row);
    if (SEPARATOR.test(text)) continue;

    const hdr = headerColumns(rows, i);
    if (hdr) {
      cols = hdr;
      headerY = row.y;
      inBlock = true;
      blockLots = [];
      pendingDesc = '';
      lastWasText = false;
      continue;
    }
    // Section titles sit between blocks; header continuation lines ("Cost or Other Basis") are not titles.
    if (!inBlock && !row.cells.some((c) => isNum(c.str)) && !(cols && Math.abs(row.y - headerY) <= 32)) {
      const sec = sectionFromText(text);
      if (sec) section = sec;
    }
    if (!cols || !inBlock) continue;
    // Remaining lines of a multi-row header.
    if (Math.abs(row.y - headerY) <= 32 && !row.cells.some((c) => isNum(c.str) || isDate(c.str))) continue;

    const byCol = new Map<ColKey, TextItem[]>();
    for (const c of row.cells) {
      const k = columnOf(cols, c);
      if (k) byCol.set(k.key, [...(byCol.get(k.key) ?? []), c]);
    }
    const num = (key: ColKey): number | undefined => {
      const c = (byCol.get(key) ?? []).find((v) => isNumLoose(v.str));
      return c ? toNumber(c.str) : undefined;
    };
    const dateIn = (key: ColKey): string | undefined => (byCol.get(key) ?? []).map((v) => v.str.trim()).find((s) => isDate(s));
    const anyDate = row.cells.map((c) => c.str.trim()).filter((s) => isDate(s));

    if (TOTALS.test(text) || (TOTALS.test(row.cells[0]!.str.trim()))) {
      const p = num('proceeds');
      if (p !== undefined) {
        totals.push({ page: row.page, proceeds: p, basis: num('basis'), count: blockLots.length });
        const sumP = blockLots.reduce((s, l) => s + l.proceeds, 0);
        if (blockLots.length && Math.abs(sumP - p) > 0.011) missing.push(`page ${row.page}: lots read sum to proceeds ${sumP.toFixed(2)} but the statement total is ${p.toFixed(2)}`);
      }
      inBlock = false;
      continue;
    }

    const proceeds = num('proceeds');
    const isLot = proceeds !== undefined && anyDate.length > 0;
    if (!isLot) {
      const hasValues = row.cells.some((c) => isNum(c.str));
      if (!hasValues && text && !/^\(?[a-z]\)/.test(text)) {
        pendingDesc = lastWasText ? `${pendingDesc} ${text}` : text;
        lastWasText = true;
      } else lastWasText = false;
      continue;
    }
    lastWasText = false;

    const firstValueX = Math.min(...cols.filter((c) => ['quantity', 'acquired', 'sold', 'proceeds'].includes(c.key)).map((c) => c.x));
    const descCol = cols.find((c) => c.key === 'description');
    const inline = row.cells
      .filter((c) => !isNumLoose(c.str) && !isDate(c.str))
      .filter((c) => (descCol ? columnOf(cols!, c)?.key === 'description' : c.x < firstValueX - 14 && columnOf(cols!, c)?.key !== 'action'))
      .map((c) => clean(c.str));
    const description = clean(inline.join(' ')) || pendingDesc;

    const acquired = dateIn('acquired') ?? (anyDate.length > 1 ? anyDate[0]! : '');
    const sold = dateIn('sold') ?? anyDate[anyDate.length - 1]!;
    const termCell = (byCol.get('term') ?? []).map((c) => c.str).join(' ');
    const coveredCell = (byCol.get('covered') ?? []).map((c) => c.str).join(' ');
    const rowTerm: Section['term'] = /short/i.test(termCell) ? 'short' : /long/i.test(termCell) ? 'long' : null;
    let term = rowTerm ?? section.term;
    let termKnown = term !== null;
    if (term === null) {
      const a = Date.parse(isoDate(acquired));
      const s = Date.parse(isoDate(sold));
      term = Number.isFinite(a) && Number.isFinite(s) && s - a > 366 * 86_400_000 ? 'long' : 'short';
      termKnown = false;
    }
    const basisReported = coveredCell ? !/non|not|^n$/i.test(coveredCell) : section.basisReported;
    const basis = num('basis') ?? 0;
    const lot: ParsedLot = {
      description, quantity: num('quantity') ?? 0,
      dateAcquired: isoDate(acquired), dateSold: isoDate(sold),
      proceeds, basis,
      accruedDiscount: num('accrued') ?? 0, washSale: num('wash') ?? 0,
      gainLoss: num('gain'), federalWithheld: num('fedWithheld') ?? 0,
      term, termKnown, basisReported, box: rowTerm ? '' : section.box, page: row.page,
    };
    if (num('basis') === undefined) missing.push(`${description || 'a lot'} sold ${lot.dateSold}: no cost basis on the statement`);
    lots.push(lot);
    blockLots.push(lot);
  }
  if (!lots.length) missing.push('no sale rows found');
  return { type: '1099-b', payer: payerName(payerItems.length ? payerItems : items), lots, totals, missing };
};

/** A return-file lot (model LotSchema) from a statement row. */
export const lotFromParsed = (l: ParsedLot): { description: string; dateAcquired: string; dateSold: string; proceeds: number; basis: number; adjustmentCode: string; adjustment: number; term: 'short' | 'long'; basisReported: boolean; reportedOn1099B: boolean } => ({
  description: l.description,
  dateAcquired: l.dateAcquired,
  dateSold: l.dateSold,
  proceeds: l.proceeds,
  basis: l.basis,
  adjustmentCode: `${l.accruedDiscount ? 'D' : ''}${l.washSale ? 'W' : ''}`,
  adjustment: Math.round((l.washSale - l.accruedDiscount) * 100) / 100,
  term: l.term,
  basisReported: l.basisReported,
  reportedOn1099B: true,
});

// ---------------------------------------------------------------------------
// Whole files
// ---------------------------------------------------------------------------

export interface ParsedMessage {
  type: DocType;
  missing: string[];
  message: string;
}

export type ParsedDoc = ParsedW2 | Parsed1099Int | Parsed1099Div | Parsed1099Misc | Parsed1099B | ParsedMessage;

const sameBoxes = (a: ParsedDoc, b: ParsedDoc): boolean => {
  if (a.type !== b.type) return false;
  const keys = Object.keys(a).filter((k) => k.startsWith('box'));
  if (!keys.length) return false;
  return keys.every((k) => (a as unknown as Record<string, unknown>)[k] === (b as unknown as Record<string, unknown>)[k]);
};

/** Every form found in one file. A consolidated brokerage statement yields several. */
export const parseTaxDocuments = (raw: TextItem[]): ParsedDoc[] => {
  const items = normalizeItems(raw);
  const regions = splitRegions(items);
  const docs: ParsedDoc[] = [];
  const payerItems = items.filter((i) => i.page === 1);
  for (const region of regions) {
    let doc: ParsedDoc;
    switch (region.type) {
      case 'w2': doc = parseW2(region.items); break;
      case '1099-int': doc = parse1099Int(region.items, payerItems); break;
      case '1099-div': doc = parse1099Div(region.items, payerItems); break;
      case '1099-misc': doc = parse1099Misc(region.items, payerItems); break;
      case '1099-b': doc = parse1099B(region.items, payerItems); break;
      case '1040': doc = { type: '1040', missing: [], message: 'This is a filed Form 1040, not a source document.' }; break;
      default: doc = { type: 'unknown', missing: [], message: 'Could not recognise this document as a W-2, 1099-INT, 1099-DIV, 1099-MISC or 1099-B. If it is a scan or photo, the OCR text may be too poor to read.' };
    }
    if (docs.some((d) => sameBoxes(d, doc))) continue;
    docs.push(doc);
  }
  // A 1099-B region split across pages produces one combined document.
  const bs = docs.filter((d): d is Parsed1099B => d.type === '1099-b' && 'lots' in d);
  if (bs.length > 1) {
    const merged: Parsed1099B = { type: '1099-b', payer: bs[0]!.payer, lots: bs.flatMap((b) => b.lots), totals: bs.flatMap((b) => b.totals), missing: bs.flatMap((b) => b.missing.filter((m) => m !== 'no sale rows found')) };
    if (!merged.lots.length) merged.missing.push('no sale rows found');
    return [...docs.filter((d) => !bs.includes(d as Parsed1099B)), merged];
  }
  return docs;
};

/** The first form in a file; kept for callers that expect one document per file. */
export const parseTaxDocument = (items: TextItem[]): ParsedDoc => parseTaxDocuments(items)[0]!;
