#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseReturn } from './model';
import { computeReturn, type ComputedReturn } from './engine';
import { fmt } from './money';
import { lotFromParsed, parseTaxDocuments } from './import/parse';
import { isImageFile } from './import/ocr';
import { ocrImageFile } from './import/ocrNode';
import { extractTextItems } from './import/pdfText';

const usage = `usage:
  tax compute <return.json> [--all] [--json]
  tax import <document.pdf>... [--into <return.json>] [--owner taxpayer|spouse]

  --all     print every schedule and worksheet, not just the Form 1040 summary
  --json    print the computed return as JSON
  --into    append the imported W-2 / 1099 documents to this return file
  --owner   whose W-2 (default taxpayer)`;

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
  for (const s of c.separateFilings) out.push(`File separately: ${s}`);
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
  if (c.ca) {
    const s = c.ca;
    out.push('');
    out.push(`California Form 540, tax year ${s.taxYear}`);
    out.push(row('13  Federal AGI', s.line13FederalAgi));
    if (s.line14) out.push(row('14  Subtractions (Schedule CA)', s.line14));
    if (s.line16) out.push(row('16  Additions (Schedule CA)', s.line16));
    out.push(row('17  California AGI', s.line17CaAgi));
    out.push(row(`18  ${s.line18IsItemized ? 'California itemized deductions' : 'California standard deduction'}`, s.line18, s.line18IsItemized ? '' : `itemized would be ${fmt(s.scheduleCA.line29Limited)}`));
    out.push(row('19  Taxable income', s.line19TaxableIncome));
    out.push(row('31  Tax', s.line31Tax, s.line31Method === 'table' ? 'tax table' : 'rate schedule'));
    out.push(row('32  Exemption credits', s.line32ExemptionCredits, s.line32ExemptionCredits < s.line11 ? `before AGI limit ${fmt(s.line11)}` : ''));
    if (s.line46RenterCredit) out.push(row('46  Renter\'s credit', s.line46RenterCredit));
    if (s.line62BehavioralHealthTax) out.push(row('62  Behavioral Health Services Tax', s.line62BehavioralHealthTax));
    out.push(row('64  Total tax', s.line64TotalTax));
    out.push(row('71  California withholding', s.line71Withholding));
    if (s.line72Estimated) out.push(row('72  Estimated payments', s.line72Estimated));
    out.push(row('78  Total payments', s.line78TotalPayments));
    if (s.line97Overpaid > 0) out.push(row('97  OVERPAID (refund)', s.line97Overpaid));
    else out.push(row('100 TAX DUE', s.line100TaxDue));
    out.push(`Effective rate ${(s.effectiveRate * 100).toFixed(1)}% of California AGI, marginal rate ${(s.marginalRate * 100).toFixed(1)}%`);
    out.push(`Attach: ${s.attachments.join(', ')}`);
    for (const w of s.warnings) out.push(`  - ${w}`);
    if (s.unverifiedParameters.length) out.push(`Unverified California ${s.taxYear} parameters: ${s.unverifiedParameters.join(', ')}`);
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
  if (c.scheduleB.line7a) {
    console.log('\n== Schedule B Part III ==');
    console.log(row('7a  Foreign account or signature authority', 'Yes'));
    console.log(row('7a  Required to file FinCEN Form 114', c.scheduleB.line7aFbarRequired ? 'Yes' : 'No'));
    console.log(row('7b  Country', c.scheduleB.line7b.join(', ')));
  }
  printFbar(c);
  printForeign(c);
  if (c.ca) {
    section('Schedule CA (540)', c.ca.scheduleCA);
    const { scheduleCA, scheduleD, attachments, warnings, unverifiedParameters, ...lines } = c.ca;
    section('Form 540', lines);
    if (scheduleD) section('Schedule D (540)', scheduleD);
  }
};

const printForeign = (c: ComputedReturn): void => {
  for (const sale of c.inheritedSales) {
    console.log(`\n== Inherited property sale: ${sale.description} ==`);
    console.log(row('Proceeds (USD)', sale.proceedsUsd, sale.currency !== 'USD' ? `converted at the sale-date rate` : ''));
    console.log(row('Basis: fair market value at date of death (USD)', sale.basisUsd));
    console.log(row('Selling costs (Form 8949 code E)', sale.sellingCostsUsd));
    console.log(row('Long-term gain, Form 8949 Box F', sale.gainUsd));
    console.log(row('Foreign tax paid on the sale (USD)', sale.foreignTaxPaidUsd));
  }
  if (c.f1116) {
    const f = c.f1116;
    console.log('\n== Form 1116, passive category ==');
    console.log(row('Adjustment exception met', f.adjustmentExceptionMet ? 'Yes' : 'No'));
    console.log(row('Rate differential adjustment applied', f.adjustmentRequired ? 'Yes' : 'No'));
    console.log(row('1a  Foreign gross income (adjusted)', f.line1a, f.adjustmentRequired ? `unadjusted ${fmt(f.foreignGrossIncome)}` : ''));
    console.log(row('3a  Standard deduction or certain itemized', f.line3a));
    console.log(row('3b  Other deductions not definitely related', f.line3b));
    console.log(row('3d  Foreign gross income', f.line3d));
    console.log(row('3e  Gross income from all sources', f.line3e));
    console.log(row('3f  Ratio', f.line3f.toFixed(4)));
    console.log(row('3g  Apportioned deductions', f.line3g));
    console.log(row('4a  Home mortgage interest apportioned', f.line4a));
    console.log(row('5   Foreign source losses', f.line5));
    console.log(row('7   Foreign taxable income', f.line7));
    console.log(row('8   Foreign taxes paid', f.line8));
    console.log(row('10  Carryover from prior years', f.line10));
    console.log(row('14  Total available foreign taxes', f.line14));
    console.log(row('18  Taxable income (worksheet if adjusted)', f.line18));
    console.log(row('19  Limitation ratio', f.line19.toFixed(4)));
    console.log(row('20  US tax before credits', f.line20));
    console.log(row('21  Limitation', f.line21));
    console.log(row('24  Credit (smaller of 14 and 23)', f.line24));
    console.log(row('35  Foreign tax credit to Schedule 3 line 1', f.line35));
    console.log(row('    Unused, carry back 1 year then forward 10', f.carryforward));
  }
  if (c.f3520.required) {
    const f = c.f3520;
    console.log('\n== Form 3520 Part IV ==');
    console.log(row('Mail to', f.mailTo));
    console.log(row('Due', `${f.dueDate}, ${f.extendedDueDate} if the return is extended`));
    console.log(row('54  Gifts or bequests from nonresident aliens or foreign estates', f.line54.total, f.line54.required ? 'Yes' : 'No'));
    if (f.line54.noneOver5000) console.log(row('    (b)', 'No gifts or bequests exceed $5,000.'));
    for (const g of f.line54.gifts) console.log(row(`    (a) ${g.date}  (b) ${g.description || g.donorName}`, g.fmvUsd, g.currency !== 'USD' ? `${fmt(g.amount)} ${g.currency} at ${g.rate}` : ''));
    console.log(row(`55  Gifts from foreign corporations or partnerships (over ${fmt(f.line55.threshold)})`, f.line55.total, f.line55.required ? 'Yes' : 'No'));
    for (const g of f.line55.gifts) console.log(row(`    (a) ${g.date}  ${g.donorName} (${g.donorType})  ${g.description}`, g.fmvUsd));
  }
  if (c.f8938.hasAssets) {
    const f = c.f8938;
    console.log('\n== Form 8938 ==');
    console.log(row('Required', f.required ? 'Yes' : 'No', `last day ${fmt(f.lastDayValue)} vs ${fmt(f.threshold.lastDay)}, any time ${fmt(f.anyTimeValue)} vs ${fmt(f.threshold.anyTime)}`));
    if (!f.required) return;
    console.log(row('Part I 5  Number of deposit accounts', f.partI.line5));
    console.log(row('Part I 6  Maximum value of deposit accounts', f.partI.line6));
    console.log(row('Part I 7  Number of custodial accounts', f.partI.line7));
    console.log(row('Part I 8  Maximum value of custodial accounts', f.partI.line8));
    console.log(row('Part I 9  Any account closed during the year', f.partI.line9AnyClosed ? 'Yes' : 'No'));
    console.log(row('Part III  Interest from these accounts (Schedule B line 1)', f.partIII.interest));
    for (const a of f.partV) {
      console.log(`  Part V: ${a.institution || 'Account ' + (a.index + 1)}`);
      console.log(row('    20  Type', a.kind === 'deposit' ? 'Deposit' : 'Custodial'));
      console.log(row('    21  Account number', a.accountNumber));
      console.log(row('    22  Opened / closed / joint with spouse', [a.openedThisYear ? 'opened' : '', a.closedThisYear ? 'closed' : '', a.jointWithSpouse ? 'joint with spouse' : ''].filter(Boolean).join(', ') || 'none'));
      console.log(row('    23  Maximum value (USD)', a.maxValueUsd, a.currency !== 'USD' ? `${fmt(a.maxValue)} ${a.currency} at ${a.treasuryRate} per USD` : ''));
      console.log(row('    26-28 Institution and address', [a.institution, a.address, a.country].filter(Boolean).join(', ')));
    }
  }
};

const printFbar = (c: ComputedReturn): void => {
  const fb = c.fbar;
  if (!fb.hasAccounts) return;
  const typeLabel = { bank: 'Bank', securities: 'Securities', other: 'Other' };
  for (const filing of fb.filings) {
    if (!filing.accounts.length) continue;
    console.log(`\n== FinCEN Form 114 (FBAR), filer: ${filing.filer} ==`);
    console.log(row('Aggregate maximum value (USD)', filing.aggregateMaxUsd, filing.anyValueUnknown ? 'plus accounts of unknown value' : ''));
    console.log(row('Filing required', filing.required ? 'Yes' : `No (aggregate at or under ${fmt(10_000)})`));
    if (!filing.required) continue;
    console.log(row('Where', 'BSA E-Filing System, bsaefiling.fincen.treas.gov'));
    console.log(row('Due', `${fb.dueDate}, automatic extension to ${fb.extendedDueDate}`));
    for (const part of ['II', 'III', 'IV'] as const) {
      const accts = filing.accounts.filter((a) => a.part === part);
      if (!accts.length) continue;
      const title = { II: 'Part II, owned separately', III: 'Part III, owned jointly', IV: 'Part IV, signature authority only' }[part];
      console.log(`\n  ${title}`);
      for (const a of accts) {
        console.log(`  Account ${a.index + 1}: ${a.institution || '(institution)'}`);
        console.log(row('    15  Maximum value (USD)', a.maxValueUnknown ? 'unknown (check 15a)' : a.maxValueUsd, a.currency !== 'USD' ? `${fmt(a.maxValue)} ${a.currency} at ${a.treasuryRate} per USD` : ''));
        console.log(row('    16  Type of account', typeLabel[a.accountType] + (a.accountType === 'other' && a.otherTypeDescription ? ` (${a.otherTypeDescription})` : '')));
        console.log(row('    17  Financial institution', a.institution));
        console.log(row('    18  Account number', a.accountNumber));
        console.log(row('    19-23 Address', [a.street, a.city, a.stateProvince, a.postalCode, a.country].filter(Boolean).join(', ')));
        if (part === 'III') {
          console.log(row('    24  Number of joint owners', a.jointOwnerCount));
          console.log(row('    25-26 Principal joint owner', a.principalJointOwner + (a.principalJointOwnerTin ? ` TIN ${a.principalJointOwnerTin}` : '')));
        }
      }
    }
  }
  if (fb.jointFilingAllowed) console.log('\n  Spouses may file one FBAR under the taxpayer with Form 114a signed by the spouse.');
};

const importDocs = async (args: string[]): Promise<void> => {
  const files: string[] = [];
  let into: string | undefined;
  let owner: 'taxpayer' | 'spouse' = 'taxpayer';
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--into') into = args[++i];
    else if (a === '--owner') owner = args[++i] === 'spouse' ? 'spouse' : 'taxpayer';
    else files.push(a);
  }
  if (!files.length) { console.error(usage); process.exit(2); }
  const ret: Record<string, unknown[]> & Record<string, unknown> = into && existsSync(into)
    ? JSON.parse(readFileSync(into, 'utf8'))
    : { taxYear: 2025, filingStatus: 'single' };
  for (const key of ['w2s', 'int1099s', 'div1099s', 'misc1099s', 'lots']) if (!Array.isArray(ret[key])) ret[key] = [];

  for (const file of files) {
    console.log(`\n${file}`);
    let items;
    if (isImageFile(file)) {
      items = await ocrImageFile(file, (m) => console.log(`  ${m}`));
    } else {
      items = await extractTextItems(file);
      if (items.length < 15) { console.log('  no text layer found. If this is a scan, export the pages as PNG or JPEG and import those, or use the web page, which runs OCR on scanned PDFs.'); continue; }
    }
    const docs = parseTaxDocuments(items);
    for (const doc of docs) {
      if ('message' in doc) { console.log(`  ${doc.type}: ${doc.message}`); continue; }
      if (doc.type === 'w2') {
        console.log(`  W-2 from ${doc.employer || '(employer not found)'} EIN ${doc.ein}`);
        console.log(`  box 1 ${fmt(doc.box1)}  box 2 ${fmt(doc.box2)}  box 3 ${fmt(doc.box3)}  box 4 ${fmt(doc.box4)}  box 5 ${fmt(doc.box5)}  box 6 ${fmt(doc.box6)}`);
        console.log(`  box 12 ${doc.box12.map((b) => `${b.code}=${fmt(b.amount)}`).join(' ') || '(none)'}  state ${doc.state} box 16 ${fmt(doc.box16)} box 17 ${fmt(doc.box17)}`);
        (ret.w2s as unknown[]).push({ employer: doc.employer, owner, box1: doc.box1, box2: doc.box2, box3: doc.box3, box4: doc.box4, box5: doc.box5, box6: doc.box6, box12: doc.box12, state: doc.state, box16: doc.box16, box17: doc.box17 });
      } else if (doc.type === '1099-int') {
        console.log(`  1099-INT from ${doc.payer}: box 1 ${fmt(doc.box1)}  box 3 ${fmt(doc.box3)}  box 4 ${fmt(doc.box4)}  box 6 ${fmt(doc.box6)}  box 8 ${fmt(doc.box8)}`);
        (ret.int1099s as unknown[]).push({ payer: doc.payer, box1: doc.box1, box3: doc.box3, box4: doc.box4, box8: doc.box8, foreignTaxPaid: doc.box6 });
      } else if (doc.type === '1099-div') {
        console.log(`  1099-DIV from ${doc.payer}: 1a ${fmt(doc.box1a)}  1b ${fmt(doc.box1b)}  2a ${fmt(doc.box2a)}  4 ${fmt(doc.box4)}  5 ${fmt(doc.box5)}  7 ${fmt(doc.box7)}`);
        (ret.div1099s as unknown[]).push({ payer: doc.payer, box1a: doc.box1a, box1b: doc.box1b, box2a: doc.box2a, box4: doc.box4, box5: doc.box5, box7: doc.box7 });
      } else if (doc.type === '1099-misc') {
        console.log(`  1099-MISC from ${doc.payer}: 1 rents ${fmt(doc.box1)}  2 royalties ${fmt(doc.box2)}  3 other ${fmt(doc.box3)}  4 withheld ${fmt(doc.box4)}  8 substitute ${fmt(doc.box8)}`);
        if (doc.box1 || doc.box2 || doc.box3 || doc.box4 || doc.box8) (ret.misc1099s as unknown[]).push({ payer: doc.payer, owner, box1: doc.box1, box2: doc.box2, box3: doc.box3, box4: doc.box4, box8: doc.box8 });
        else console.log('  (all boxes zero, not added)');
      } else if (doc.type === '1099-b') {
        console.log(`  1099-B from ${doc.payer}: ${doc.lots.length} lot${doc.lots.length === 1 ? '' : 's'}, proceeds ${fmt(doc.lots.reduce((s, l) => s + l.proceeds, 0))}, basis ${fmt(doc.lots.reduce((s, l) => s + l.basis, 0))}`);
        for (const l of doc.lots) {
          console.log(`    ${l.term}/${l.basisReported ? 'reported' : 'not reported'}${l.box ? ' box ' + l.box : ''}${l.termKnown ? '' : ' (term from dates)'}  ${l.dateAcquired} -> ${l.dateSold}  proceeds ${fmt(l.proceeds)}  basis ${fmt(l.basis)}${l.washSale ? '  wash ' + fmt(l.washSale) : ''}${l.accruedDiscount ? '  accrued discount ' + fmt(l.accruedDiscount) : ''}  ${l.description.slice(0, 50)}`);
          (ret.lots as unknown[]).push(lotFromParsed(l));
        }
      }
      if (doc.missing.length) console.log(`  check: ${doc.missing.join('; ')}`);
    }
    if (!docs.length) console.log('  nothing recognised');
  }
  if (into) {
    writeFileSync(into, JSON.stringify(ret, null, 2) + '\n');
    console.log(`\nwrote ${into}`);
  }
};

const main = (): void => {
  const [cmd, file, ...flags] = process.argv.slice(2);
  if (cmd === 'import') { void importDocs(process.argv.slice(3)); return; }
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
