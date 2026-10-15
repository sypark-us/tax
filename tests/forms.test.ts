import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as PdfLib from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { computeReturn } from '../src/engine';
import { parseReturn, type TaxReturn } from '../src/model';
import { FIELD_MAPS, FORM_TITLES, type FormId, type FormYear } from '../src/pdf/fieldMaps';
import { assemblePackage, fillReturn, resolveField } from '../src/pdf/fill';
import { blankFormPath, produceForms, readBlankForm } from '../src/pdf/node';
import { buildFormValues } from '../src/pdf/values';

const years: FormYear[] = [2025, 2026];
const sample = (): TaxReturn => parseReturn(JSON.parse(readFileSync(new URL('./fixtures/sample-mfj.json', import.meta.url), 'utf8')));

const fieldsOf = async (year: FormYear, form: FormId) => {
  const doc = await PdfLib.PDFDocument.load(await readBlankForm(year, form), { ignoreEncryption: true, updateMetadata: false });
  return doc.getForm().getFields().map((field) => ({ name: field.getName(), field }));
};

const readValues = async (bytes: Uint8Array): Promise<Record<string, string>> => {
  const doc = await PdfLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const out: Record<string, string> = {};
  for (const f of doc.getForm().getFields()) {
    const name = f.getName().replace(/^(topmostSubform|form1)\[0\]\./, '').replace(/\[0\]/g, '');
    if (f instanceof PdfLib.PDFTextField) { const t = f.getText(); if (t) out[name] = t; }
    else if (f instanceof PdfLib.PDFCheckBox && f.isChecked()) out[name] = 'X';
  }
  return out;
};

describe('field maps match the IRS PDFs in forms/<year>', () => {
  for (const year of years) {
    for (const form of Object.keys(FIELD_MAPS[year]) as FormId[]) {
      it(`${year} ${FORM_TITLES[form]}: every mapped field exists exactly once`, async () => {
        expect(existsSync(blankFormPath(year, form))).toBe(true);
        const fields = await fieldsOf(year, form);
        const map = FIELD_MAPS[year][form];
        const bad: string[] = [];
        for (const [key, short] of Object.entries(map)) {
          try { resolveField(fields, short); } catch (e) { bad.push(`${key} -> ${short}: ${(e as Error).message}`); }
        }
        expect(bad).toEqual([]);
      });
    }
  }
});

/** A household that touches most forms: itemized, SE, 1099-MISC, foreign, lots, dependents, tips. */
const busy = (year: FormYear): TaxReturn => {
  const r = sample();
  const raw = JSON.parse(JSON.stringify(r));
  raw.taxYear = year;
  raw.identity = { ssn: '123-45-6789', spouseSsn: '987-65-4321', street: '1 Main St', apt: '2B', city: 'San Jose', state: 'CA', zip: '95110', phone: '408-555-0100', email: 'alex@example.com', occupation: 'Engineer', spouseOccupation: 'Nurse', digitalAssets: false, refund: { routing: '121000248', account: '000123456789', accountType: 'checking' } };
  raw.dependents[0].ssn = '111-22-3333';
  raw.w2s[0].qualifiedTips = 1_000;
  raw.w2s[0].qualifiedOvertime = 2_000;
  raw.scheduleC = [{ name: 'Side Consulting', owner: 'taxpayer', grossReceipts: 30_000, returnsAndAllowances: 0, costOfGoodsSold: 0, expenses: 5_000 }];
  raw.misc1099s = [{ payer: 'Broker', owner: 'taxpayer', box1: 0, box2: 0, box3: 400, box4: 0, box8: 0 }];
  raw.itemized = { medical: 0, stateLocalIncomeTaxOther: 0, realEstateTax: 9_000, personalPropertyTax: 500, mortgageInterest: 18_000, charityCash: 6_000, charityNoncash: 0, other: 0 };
  raw.int1099s.push({ payer: 'Kookmin Bank', box1: 2_000, foreignCountry: 'Korea, South', foreignTaxPaid: 300 });
  raw.foreignGifts = [{ date: `${year}-03-01`, description: 'Cash', donorName: 'Parent', donorType: 'individual', donorCountry: 'Korea, South', currency: 'USD', amount: 150_000, rate: 1 }];
  raw.taxpayer.age65OrOlder = true;
  return parseReturn(raw);
};

describe('filling the forms', () => {
  for (const year of years) {
    it(`${year}: fills every attached form without unmapped keys and reads the values back`, async () => {
      const ret = busy(year);
      const c = computeReturn(ret);
      const entries = buildFormValues(ret, c);
      const forms = entries.map((e) => e.form);
      expect(forms).toEqual(expect.arrayContaining(['f1040', 'f1040s1', 'f1040s2', 'f1040s3', 'f1040sa', 'f1040sb', 'f1040sd', 'f8949', 'f1040sse', 'f1040s1a', 'f1040s8', 'f8995', 'f1116', 'f3520']));
      const filled = await fillReturn(PdfLib, year, entries, (form) => readBlankForm(year, form));
      const f1040 = await readValues(filled.find((f) => f.form === 'f1040')!.bytes);
      expect(f1040['Page1.f1_14']).toBe('Alex');
      expect(f1040['Page1.f1_16']).toBe('123456789'); // comb field of 9: dashes stripped
      expect(f1040['Page1.f1_47']).toBe(c.f1040.line1a.toLocaleString('en-US'));
      expect(f1040['Page1.f1_75']).toBe(c.f1040.line11.toLocaleString('en-US'));
      const refundKey = year === 2026 ? 'Page2.f2_35' : 'Page2.f2_30';
      const oweKey = year === 2026 ? 'Page2.f2_40' : 'Page2.f2_35';
      if (c.f1040.line34 > 0) expect(f1040[refundKey]).toBe(c.f1040.line34.toLocaleString('en-US'));
      else expect(f1040[oweKey]).toBe(c.f1040.line37.toLocaleString('en-US'));
      // Schedule 1-A total lands on the right 1040 line for the year (13b in 2025, 13a in 2026): both are field f2_04.
      expect(f1040['Page2.f2_04']).toBe(c.schedule1A.total.toLocaleString('en-US'));
      expect(c.schedule1A.total).toBeGreaterThan(0);
      // Draft cover sheets are dropped: the 1040 is two pages either year.
      const doc = await PdfLib.PDFDocument.load(filled.find((f) => f.form === 'f1040')!.bytes, { ignoreEncryption: true, updateMetadata: false });
      expect(doc.getPageCount()).toBe(2);
      // Form 8949 pages: short-term lots on a page-1 copy, long-term on a page-2 copy.
      const f8949s = filled.filter((f) => f.form === 'f8949');
      expect(f8949s.length).toBe(c.scheduleD.f8949.length);
      for (const f of f8949s) {
        const d = await PdfLib.PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false });
        expect(d.getPageCount()).toBe(1);
      }
      const pkg = await assemblePackage(PdfLib, filled);
      const pkgDoc = await PdfLib.PDFDocument.load(pkg, { ignoreEncryption: true, updateMetadata: false });
      expect(pkgDoc.getPageCount()).toBeGreaterThan(10);
      expect(pkgDoc.getForm().getFields().length).toBe(0);
    }, 60_000);
  }

  it('Schedule B overflow folds extra payers into the last row', () => {
    const raw = JSON.parse(JSON.stringify(sample()));
    raw.int1099s = Array.from({ length: 16 }, (_, i) => ({ payer: `Bank ${i + 1}`, box1: 100 * (i + 1) }));
    const ret = parseReturn(raw);
    const c = computeReturn(ret);
    const sb = buildFormValues(ret, c).find((e) => e.form === 'f1040sb')!;
    expect(sb.values.int13Payer).toBe('Bank 13');
    expect(sb.values.int14Payer).toBe('3 other payers (see statement)');
    expect(sb.values.int14Amount).toBe(1_400 + 1_500 + 1_600);
  });
});

const actualFile = new URL('../data/2025-actual.json', import.meta.url);
describe.skipIf(!existsSync(actualFile))('the filed 2025 return (private file)', () => {
  it('produces the attachment set and the right balance due', async () => {
    const ret = parseReturn(JSON.parse(readFileSync(actualFile, 'utf8')));
    const c = computeReturn(ret);
    const result = await produceForms(ret, c, fileURLToPath(new URL('../data/actual-forms-test/', import.meta.url)));
    expect(result.forms.map((f) => f.title)).toEqual(expect.arrayContaining(['Form 1040', 'Schedule A', 'Schedule B', 'Schedule D', 'Form 8959', 'Form 8960']));
    const v = await readValues(result.forms.find((f) => f.form === 'f1040')!.bytes);
    expect(v['Page2.f2_35'] ?? v['Page2.f2_30']).toBe((c.f1040.line37 || c.f1040.line34).toLocaleString('en-US'));
  }, 60_000);
});
