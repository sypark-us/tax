// Lists the fill-in fields of a PDF form: page, name, type, position, and
// the text printed nearby, so a field map can be written against it.
//   node scripts/pdf-fields.mjs forms/2025/f1040.pdf [--near]
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFCheckBox, PDFTextField, PDFRadioGroup, PDFDropdown } from 'pdf-lib';

const file = process.argv[2];
const near = process.argv.includes('--near');
const bytes = readFileSync(file);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
const pages = doc.getPages();
const pageIndex = new Map(pages.map((p, i) => [p.ref.toString(), i]));
const form = doc.getForm();

let items = [];
if (near) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items) if (it.str.trim()) items.push({ page: p - 1, x: it.transform[4], y: it.transform[5], str: it.str.trim() });
  }
}
const nearby = (page, x, y) => items
  .filter((it) => it.page === page && it.y < y + 14 && it.y > y - 10 && it.x < x && it.x > x - 320)
  .sort((a, b) => b.x - a.x).slice(0, 4).map((it) => it.str).reverse().join(' ');

const typeOf = (f) => f instanceof PDFCheckBox ? 'check' : f instanceof PDFTextField ? 'text' : f instanceof PDFRadioGroup ? 'radio' : f instanceof PDFDropdown ? 'drop' : 'other';
for (const f of form.getFields()) {
  const widgets = f.acroField.getWidgets();
  for (const w of widgets) {
    const pref = w.P();
    let page = pref ? pageIndex.get(pref.toString()) : undefined;
    if (page === undefined) {
      page = pages.findIndex((pg) => (pg.node.Annots()?.asArray() ?? []).some((a) => a.toString() === (doc.context.getObjectRef(w.dict) ?? '').toString()));
    }
    const r = w.getRectangle();
    let extra = '';
    if (f instanceof PDFCheckBox || f instanceof PDFRadioGroup) {
      const ap = w.getAppearances()?.normal;
      const keys = ap && ap.dict ? [...ap.dict.keys()].map((k) => k.decodeText()).filter((k) => k !== 'Off') : [];
      extra = ' on=' + keys.join('|');
    } else if (f instanceof PDFTextField) {
      const ml = f.acroField.getMaxLength();
      if (ml) extra = ' max=' + ml;
      if (f.isMultiline()) extra += ' multiline';
    }
    const tip = f.acroField.dict.get(PDFName.of('TU'));
    const tipText = tip && tip.decodeText ? tip.decodeText() : '';
    console.log(`p${page + 1}\t${typeOf(f)}\t${f.getName()}\t${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}${extra}\t${near ? nearby(page, r.x, r.y) : tipText}`);
  }
}
