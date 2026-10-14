#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseReturn } from './model';
import { computeReturn, type ComputedReturn } from './engine';
import { fmt } from './money';

const usage = `usage:
  tax compute <return.json> [--all] [--json]

  --all   print every schedule and worksheet, not just the Form 1040 summary
  --json  print the computed return as JSON`;

const row = (label: string, value: number | string | undefined, note = ''): string => {
  const v = typeof value === 'number' ? fmt(value) : (value ?? '');
  return `  ${label.padEnd(58)} ${v.padStart(12)}  ${note}`;
};

const printSummary = (c: ComputedReturn): void => {
  const f = c.f1040;
  const out: string[] = [];
  out.push(`Form 1040, tax year ${c.taxYear}, filing status ${c.filingStatus.toUpperCase()}`);
  out.push('');
  out.push('Income');
  out.push(row('1a  Wages (W-2 box 1)', f.line1a));
  out.push(row('2b  Taxable interest', f.line2b, f.line2a ? `(2a tax-exempt ${fmt(f.line2a)})` : ''));
  out.push(row('3b  Ordinary dividends', f.line3b, `(3a qualified ${fmt(f.line3a)})`));
  out.push(row('7   Capital gain or (loss)', f.line7, f.line7ScheduleDNotRequired ? 'Schedule D not required' : 'Schedule D'));
  out.push(row('8   Additional income (Schedule 1)', f.line8));
  out.push(row('9   Total income', f.line9));
  out.push(row('10  Adjustments (Schedule 1)', f.line10));
  out.push(row('11  Adjusted gross income', f.line11));
  out.push('');
  out.push('Deductions');
  out.push(row(`12  ${f.line12IsItemized ? 'Itemized deductions (Schedule A)' : 'Standard deduction'}`, f.line12,
    f.line12IsItemized ? `standard would be ${fmt(c.standardDeduction)}` : `itemized would be ${fmt(c.scheduleA.line17)}`));
  if (f.line13a) out.push(row('13a Qualified business income deduction', f.line13a));
  if (f.line13b) out.push(row('13b Schedule 1-A deductions', f.line13b));
  out.push(row('15  Taxable income', f.line15));
  out.push('');
  out.push('Tax and credits');
  out.push(row('16  Tax', f.line16, f.line16Method === 'qdcg' ? 'QD/CG worksheet' : 'tax table'));
  if (f.line19) out.push(row('19  Child tax credit', f.line19));
  if (f.line20) out.push(row('20  Other nonrefundable credits (Schedule 3)', f.line20));
  out.push(row('22  Tax after credits', f.line22));
  if (c.schedule2.line4) out.push(row('    Self-employment tax', c.schedule2.line4));
  if (c.schedule2.line11) out.push(row('    Additional Medicare tax (Form 8959)', c.schedule2.line11));
  if (c.schedule2.line12) out.push(row('    Net investment income tax (Form 8960)', c.schedule2.line12));
  out.push(row('24  Total tax', f.line24));
  out.push('');
  out.push('Payments');
  out.push(row('25a Federal withholding (W-2)', f.line25a));
  if (f.line25b) out.push(row('25b Federal withholding (1099)', f.line25b));
  if (f.line25c) out.push(row('25c Other withholding (incl. Form 8959)', f.line25c));
  if (f.line26) out.push(row('26  Estimated payments', f.line26));
  if (f.line28) out.push(row('28  Additional child tax credit', f.line28));
  if (f.line31) out.push(row('31  Other payments (Schedule 3)', f.line31));
  out.push(row('33  Total payments', f.line33));
  out.push('');
  if (f.line34 > 0) out.push(row('34  REFUND', f.line34));
  else out.push(row('37  AMOUNT YOU OWE', f.line37));
  out.push('');
  out.push(`Effective rate ${(f.effectiveRate * 100).toFixed(1)}% of AGI, marginal ordinary rate ${(f.marginalRate * 100).toFixed(0)}%`);
  out.push(`Attach: ${c.attachments.join(', ')}`);
  if (c.scheduleD.required) {
    const co = c.scheduleD.nextYearCarryover;
    if (co.shortTerm || co.longTerm) out.push(`Capital loss carryover to next year: short ${fmt(co.shortTerm)}, long ${fmt(co.longTerm)}`);
  }
  if (c.warnings.length) {
    out.push('');
    out.push('Warnings');
    for (const w of c.warnings) out.push(`  - ${w}`);
  }
  if (c.unverifiedParameters.length) {
    out.push('');
    out.push(`Unverified ${c.taxYear} parameters (confirm before filing): ${c.unverifiedParameters.join(', ')}`);
  }
  console.log(out.join('\n'));
};

const printAll = (c: ComputedReturn): void => {
  const section = (title: string, obj: object) => {
    console.log(`\n== ${title} ==`);
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'number') console.log(row(k, v));
      else if (typeof v === 'boolean' || typeof v === 'string') console.log(row(k, String(v)));
    }
  };
  section('Schedule 1', c.schedule1);
  section('Schedule 2', c.schedule2);
  section('Schedule 3', c.schedule3);
  section('Schedule A', c.scheduleA);
  section('Schedule B', c.scheduleB);
  section('Schedule D', c.scheduleD);
  for (const part of c.scheduleD.f8949) {
    console.log(`\n== Form 8949 Box ${part.box} ==`);
    for (const x of part.rows) {
      console.log(`  ${x.description.padEnd(30)} ${x.dateAcquired.padEnd(10)} ${x.dateSold.padEnd(10)} ${fmt(x.proceeds).padStart(10)} ${fmt(x.basis).padStart(10)} ${x.code.padEnd(2)} ${fmt(x.adjustment).padStart(8)} ${fmt(x.gain).padStart(10)}`);
    }
    console.log(row('  totals', `${fmt(part.proceeds)} / ${fmt(part.basis)} / ${fmt(part.adjustment)} / ${fmt(part.gain)}`));
  }
  c.scheduleSE.forEach((s) => section(`Schedule SE (${s.owner})`, s));
  section('Schedule 1-A', c.schedule1A);
  section('Schedule 8812', c.schedule8812);
  section('Form 8959', c.f8959);
  section('Form 8960', c.f8960);
  section('Form 8995', c.f8995);
  if (c.qdcg) section('Qualified Dividends and Capital Gain Tax Worksheet', c.qdcg);
};

const main = (): void => {
  const [cmd, file, ...flags] = process.argv.slice(2);
  if (cmd !== 'compute' || !file) {
    console.error(usage);
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const ret = parseReturn(raw);
  const computed = computeReturn(ret);
  if (flags.includes('--json')) {
    console.log(JSON.stringify(computed, null, 2));
    return;
  }
  printSummary(computed);
  if (flags.includes('--all')) printAll(computed);
};

main();
