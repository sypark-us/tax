// Compares two layout dumps (from pdf-layout.mjs) field by field: for every
// fill-in field, the text of the row it sits on. Prints the fields whose row
// text changed or which exist in only one year.
//   node scripts/pdf-layout-diff.mjs a.layout.txt b.layout.txt
import { readFileSync } from 'node:fs';

const rows = (file) => {
  const out = new Map();
  const noise = /DRAFT|— DO NOT FILE|TREASURY\/IRS AND OMB USE ONLY/g;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^ *\d+ \| (.*)$/);
    if (!m) continue;
    const text = m[1].replace(noise, '');
    const fields = [...text.matchAll(/[\[☐{]([^\]\s}]+)[\]}]?/g)].map((x) => x[1].replace(/:\d+$/, '').replace(/=.*$/, ''));
    const label = text.replace(/[\[☐{][^\]\s}]+[\]}]?/g, '').replace(/\b20(2[4-7])\b/g, 'YYYY').replace(/\s+/g, ' ').trim();
    for (const f of fields) {
      const short = f.split('.').pop();
      out.set(short, { label, full: f });
    }
  }
  return out;
};

const [a, b] = process.argv.slice(2).map(rows);
const names = new Set([...a.keys(), ...b.keys()]);
const norm = (s) => s.replace(/\d+ [a-z] /g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
let changed = 0;
for (const n of [...names].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))) {
  const ra = a.get(n), rb = b.get(n);
  if (!ra) { console.log(`+ ${n}\t${rb.label.slice(0, 110)}`); changed++; continue; }
  if (!rb) { console.log(`- ${n}\t${ra.label.slice(0, 110)}`); changed++; continue; }
  if (norm(ra.label) !== norm(rb.label)) { console.log(`~ ${n}\n    was: ${ra.label.slice(0, 110)}\n    now: ${rb.label.slice(0, 110)}`); changed++; }
}
console.log(changed ? `${changed} differences` : 'identical field rows');
