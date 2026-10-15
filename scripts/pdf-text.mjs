// Prints the first N characters of each page's text: node scripts/pdf-text.mjs file.pdf [chars]
import { readFileSync } from 'node:fs';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const [file, chars = '400'] = process.argv.slice(2);
const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise;
for (let p = 1; p <= pdf.numPages; p++) {
  const tc = await (await pdf.getPage(p)).getTextContent();
  console.log(`--- page ${p}/${pdf.numPages}`);
  console.log(tc.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').slice(0, Number(chars)));
}
