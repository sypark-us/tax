// Prints the filled-in values of a PDF form: node scripts/pdf-values.mjs filled.pdf
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFCheckBox, PDFTextField } from 'pdf-lib';

const doc = await PDFDocument.load(readFileSync(process.argv[2]), { ignoreEncryption: true, updateMetadata: false });
for (const f of doc.getForm().getFields()) {
  const name = f.getName().replace(/^(topmostSubform|form1)\[0\]\./, '').replace(/\[0\]/g, '');
  if (f instanceof PDFTextField) { const t = f.getText(); if (t) console.log(`${name}\t${t}`); }
  else if (f instanceof PDFCheckBox) { if (f.isChecked()) console.log(`${name}\t[x]`); }
}
