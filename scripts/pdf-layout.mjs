// Prints a form page as rows: the printed text and the fill-in fields that sit
// on the same line, left to right, so a field map can be written by eye.
//   node scripts/pdf-layout.mjs forms/2025/f1040.pdf [pageNumber]
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFCheckBox, PDFTextField, PDFRadioGroup } from 'pdf-lib';

const [file, onlyPage] = process.argv.slice(2);
const bytes = readFileSync(file);
const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
const pages = doc.getPages();
const pageIndex = new Map(pages.map((p, i) => [p.ref.toString(), i]));
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;

const short = (name) => name.replace(/^topmostSubform\[0\]\./, '').replace(/\[0\]/g, '');
const cells = [];
for (const f of doc.getForm().getFields()) {
  for (const w of f.acroField.getWidgets()) {
    const pref = w.P();
    const page = pref ? pageIndex.get(pref.toString()) : -1;
    const r = w.getRectangle();
    let tag;
    if (f instanceof PDFCheckBox || f instanceof PDFRadioGroup) {
      const ap = w.getAppearances()?.normal;
      const on = ap && ap.dict ? [...ap.dict.keys()].map((k) => k.decodeText()).filter((k) => k !== 'Off').join('|') : '';
      tag = `☐${short(f.getName())}${on && on !== '1' ? '=' + on : ''}`;
    } else if (f instanceof PDFTextField) {
      const ml = f.acroField.getMaxLength();
      tag = `[${short(f.getName())}${ml ? ':' + ml : ''}]`;
    } else tag = `{${short(f.getName())}}`;
    cells.push({ page, x: r.x, y: r.y + r.height / 2, h: r.height, str: tag, field: true });
  }
}
for (let p = 1; p <= pdf.numPages; p++) {
  const tc = await (await pdf.getPage(p)).getTextContent();
  for (const it of tc.items) if (it.str.trim()) cells.push({ page: p - 1, x: it.transform[4], y: it.transform[5] + 3, str: it.str.trim(), field: false });
}
for (let p = 0; p < pages.length; p++) {
  if (onlyPage && Number(onlyPage) !== p + 1) continue;
  console.log(`===== page ${p + 1}`);
  const rows = [];
  for (const c of cells.filter((c) => c.page === p).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find((r) => Math.abs(r.y - c.y) < 5);
    if (row) row.cells.push(c); else rows.push({ y: c.y, cells: [c] });
  }
  for (const r of rows) {
    r.cells.sort((a, b) => a.x - b.x);
    console.log(`${String(Math.round(r.y)).padStart(3)} | ` + r.cells.map((c) => c.str).join(' ').replace(/(\s\.){2,}/g, ' …'));
  }
}
