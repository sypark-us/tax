// Downloads the IRS fill-in PDFs for a tax year into forms/<year>/.
//   node scripts/fetch-forms.mjs 2026
// Final forms come from irs.gov/pub/irs-prior/<form>--<year>.pdf; until the
// IRS issues them the early-release draft (irs-dft, watermarked DRAFT) is used.
// Form 8938 and Form 3520 are not revised yearly and come from irs-pdf.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const year = Number(process.argv[2]);
if (!year) { console.error('usage: node scripts/fetch-forms.mjs <year>'); process.exit(2); }
const yearly = ['f1040', 'f1040s1', 'f1040s1a', 'f1040s2', 'f1040s3', 'f1040sa', 'f1040sb', 'f1040sd', 'f8949', 'f1040sse', 'f1116', 'f1040s8', 'f8995', 'f8959', 'f8960'];
const fixed = ['f8938', 'f3520'];
const dir = join('forms', String(year));
mkdirSync(dir, { recursive: true });

const fetchPdf = async (url) => {
  const res = await fetch(url);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes.length > 1000 && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF' ? bytes : null;
};

let drafts = 0;
for (const f of yearly) {
  let bytes = await fetchPdf(`https://www.irs.gov/pub/irs-prior/${f}--${year}.pdf`);
  let source = 'final';
  if (!bytes) { bytes = await fetchPdf(`https://www.irs.gov/pub/irs-dft/${f}--dft.pdf`); source = 'DRAFT'; drafts++; }
  if (!bytes) { console.log(`${f}: not available`); continue; }
  writeFileSync(join(dir, `${f}.pdf`), bytes);
  console.log(`${f}: ${source} (${(bytes.length / 1024).toFixed(0)} KB)`);
}
for (const f of fixed) {
  const bytes = await fetchPdf(`https://www.irs.gov/pub/irs-pdf/${f}.pdf`);
  if (!bytes) { console.log(`${f}: not available`); continue; }
  writeFileSync(join(dir, `${f}.pdf`), bytes);
  console.log(`${f}: current revision (${(bytes.length / 1024).toFixed(0)} KB)`);
}
if (drafts) console.log(`${drafts} form(s) are early-release drafts. Drafts cannot be filed; fetch again after the IRS issues the finals, then run npm test to check the field maps.`);
