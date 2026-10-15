/**
 * Turns a computed return into the entries for each IRS form, keyed the way
 * src/pdf/fieldMaps.ts names the lines. Pure: no PDF library here, so it runs
 * in the browser bundle as well as in Node.
 *
 * Numbers are whole dollars; the filler prints them with thousands separators
 * and losses in parentheses, and leaves zero amounts blank. A string is
 * printed as given (use it for totals that should show "0"). A boolean checks
 * a box.
 */
import type { ComputedReturn } from '../engine';
import type { TaxReturn } from '../model';
import { paramsFor, paramStatus } from '../params';
import { max0, pct } from '../money';
import type { FormId, FormYear } from './fieldMaps';
import { F8949_ROWS } from './fieldMaps';

export type CellValue = string | number | boolean;

export interface FormValues {
  form: FormId;
  /** Second and later copies of the same form (Form 8949 pages, Form 8938 continuation). */
  copy: number;
  values: Record<string, CellValue>;
  /** Keep only these pages (0-based, after the draft cover page is removed). */
  pages?: number[];
}

const fmtWhole = (n: number): string => {
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString('en-US');
  return v < 0 ? `(${s})` : s;
};
/** A total that prints even when zero. */
const n0 = (n: number): string => fmtWhole(n);
/** Mo/day/year as the forms ask, from ISO; anything else (VARIOUS, INHERITED) passes through. */
const mdy = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
};
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`.trim();
const splitName = (name: string): { first: string; last: string } => {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { first: name.trim(), last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1]! };
};
const yes = (b: boolean): Record<string, boolean> => (b ? { Yes: true } : { No: true });

export const buildFormValues = (ret: TaxReturn, c: ComputedReturn): FormValues[] => {
  const year = ret.taxYear as FormYear;
  const p = paramsFor(ret.taxYear);
  const ps = paramStatus(ret.filingStatus);
  const f = c.f1040;
  const id = ret.identity;
  const married = ret.filingStatus === 'mfj';
  const names = married && ret.spouse ? `${fullName(ret.taxpayer)} and ${fullName(ret.spouse)}` : fullName(ret.taxpayer);
  const header = { name: names, ssn: id.ssn };
  const out: FormValues[] = [];
  const add = (form: FormId, values: Record<string, CellValue>, extra: Partial<FormValues> = {}): void => {
    out.push({ form, copy: extra.copy ?? 0, values, ...(extra.pages ? { pages: extra.pages } : {}) });
  };

  // ---------------------------------------------------------------- Form 1040
  const v: Record<string, CellValue> = {
    firstName: ret.taxpayer.firstName, lastName: ret.taxpayer.lastName, ssn: id.ssn,
    street: id.street, apt: id.apt, city: id.city, state: id.state, zip: id.zip,
    presidentialYou: id.presidentialFund.taxpayer, presidentialSpouse: married && id.presidentialFund.spouse,
    digitalYes: id.digitalAssets, digitalNo: !id.digitalAssets,
    you65: ret.taxpayer.age65OrOlder, youBlind: ret.taxpayer.blind,
    occupation: id.occupation, phone: id.phone, email: id.email, designeeNo: true,
  };
  if (married && ret.spouse) {
    Object.assign(v, { spouseFirstName: ret.spouse.firstName, spouseLastName: ret.spouse.lastName, spouseSsn: id.spouseSsn, spouse65: ret.spouse.age65OrOlder, spouseBlind: ret.spouse.blind, spouseOccupation: id.spouseOccupation });
  }
  v[{ single: 'fsSingle', mfj: 'fsMfj', mfs: 'fsMfs', hoh: 'fsHoh', qss: 'fsQss' }[ret.filingStatus]] = true;
  if (ret.filingStatus === 'mfs') v.mfsSpouseName = id.qualifyingPersonName || (ret.spouse ? fullName(ret.spouse) : '');
  if (ret.filingStatus === 'hoh' || ret.filingStatus === 'qss') v.qualifyingChildName = id.qualifyingPersonName;
  if (year >= 2026) {
    Object.assign(v, { citizenYouYes: id.workAuthorized.taxpayer, citizenYouNo: !id.workAuthorized.taxpayer });
    if (married) Object.assign(v, { citizenSpouseYes: id.workAuthorized.spouse, citizenSpouseNo: !id.workAuthorized.spouse });
  }
  ret.dependents.slice(0, 4).forEach((d, i) => {
    const k = i + 1;
    const nm = splitName(d.name);
    const ctc = d.qualifyingChild && d.age < 17 && d.hasValidSsn;
    Object.assign(v, { [`dep${k}First`]: nm.first, [`dep${k}Last`]: nm.last, [`dep${k}Ssn`]: d.ssn, [`dep${k}Rel`]: d.relationship, [`dep${k}Ctc`]: ctc, [`dep${k}Odc`]: !ctc });
  });
  Object.assign(v, {
    '1a': f.line1a, '1z': n0(f.line1z), '2a': f.line2a, '2b': f.line2b, '3a': f.line3a, '3b': f.line3b,
    '7a': f.line7, '7bNoScheduleD': f.line7ScheduleDNotRequired && f.line7 !== 0,
    '8': f.line8, '9': n0(f.line9), '10': f.line10, '11a': n0(f.line11), '11b': n0(f.line11),
    '12e': n0(f.line12 - f.line12f), '14': n0(f.line14), '15': n0(f.line15), '16': n0(f.line16), '17': f.line17, '18': n0(f.line18),
    '19': f.line19, '20': f.line20, '21': f.line21, '22': n0(f.line22), '23': f.line23,
    '25a': f.line25a, '25b': f.line25b, '25c': f.line25c, '25d': n0(f.line25d), '26': f.line26, '28': f.line28, '31': f.line31,
    '33': n0(f.line33), '38': 0,
  });
  const qbi = c.f8995.line15;
  const s1aTotal = c.schedule1A.total;
  const otherPayments = f.line28 + f.line31;
  if (year >= 2026) {
    Object.assign(v, { '12f': f.line12f, '13a': s1aTotal, '13b': qbi, '24a': n0(f.line24), '24c': n0(f.line24), '32a': otherPayments, '32c': otherPayments });
  } else {
    Object.assign(v, { '13a': qbi, '13b': s1aTotal, '24': n0(f.line24), '32': otherPayments });
  }
  if (f.line34 > 0) {
    Object.assign(v, { '34': f.line34, '35a': f.line34 });
    if (id.refund.routing && id.refund.account) {
      Object.assign(v, { routing: id.refund.routing, account: id.refund.account, checking: id.refund.accountType === 'checking', savings: id.refund.accountType === 'savings' });
    }
  } else {
    v['37'] = n0(f.line37);
  }
  add('f1040', v);

  const has = (title: string): boolean => c.attachments.some((a) => a === title || a.startsWith(title + ' '));

  // ---------------------------------------------------------------- Schedule 1
  if (has('Schedule 1')) {
    const s = c.schedule1;
    add('f1040s1', {
      ...header,
      '3': s.line3, '5': s.line5,
      '8zType': s.line8z ? 'Form 1099-MISC other income' : '', '8z': s.line8z, '9': s.line8z, '10': n0(s.line10),
      '13': s.line13, '15': s.line15, '20': s.line20, '21': s.line21,
      '24zType': s.line24z ? 'Other adjustments' : '', '24z': s.line24z, '25': s.line24z, '26': n0(s.line26),
    });
  }

  // ---------------------------------------------------------------- Schedule 2
  if (has('Schedule 2')) {
    const s = c.schedule2;
    const medicareOnWages = c.f8959.line7;
    const medicareOnSe = c.f8959.line13;
    add('f1040s2', year >= 2026
      ? { ...header, '4': s.line4, '6': s.line12, '11': medicareOnSe, '15': n0(s.line4 + s.line12 + medicareOnSe), '17b': medicareOnWages, '17d': medicareOnWages, '20': n0(medicareOnWages), '21': n0(s.line21) }
      : { ...header, '4': s.line4, '11': s.line11, '12': s.line12, '21': n0(s.line21) });
  }

  // ---------------------------------------------------------------- Schedule 3
  if (has('Schedule 3')) {
    const s = c.schedule3;
    add('f1040s3', { ...header, '1': s.line1, '8': n0(s.line8), '10': ret.payments.extension, '11': s.line11, '15': n0(s.line15) });
  }

  // ---------------------------------------------------------------- Schedule A
  if (f.line12IsItemized) {
    const a = c.scheduleA;
    const common = {
      ...header,
      '1': a.line1, '2': a.line2, '3': a.line3, '4': a.line4,
      '5a': a.line5a, '5b': a.line5b, '5c': a.line5c, '5d': a.line5d, '5e': a.line5e, '7': a.line7,
      '8a': a.line8a, '8e': a.line8a, '10': a.line10, '11': a.line11, '12': a.line12,
      electItemize: ret.deductionMethod === 'itemized' && a.line17 < c.standardDeduction,
    };
    if (year >= 2026) {
      const limited = f.line12 < a.line17;
      add('f1040sa', { ...common, '13': a.line14, '15': a.line14, '17z': a.line16, limitedYes: limited, limitedNo: !limited, '18': n0(f.line12) });
    } else {
      add('f1040sa', { ...common, '14': a.line14, '16': a.line16, '17': n0(a.line17) });
    }
  }

  // ---------------------------------------------------------------- Schedule B
  if (c.scheduleB.required) {
    const b = c.scheduleB;
    const sv: Record<string, CellValue> = { ...header, '2': n0(b.line2), '4': n0(b.line4), '6': n0(b.line6) };
    const listRows = (rows: Array<{ payer: string; amount: number }>, prefix: string, max: number): void => {
      const shown = rows.length > max ? rows.slice(0, max - 1) : rows;
      shown.forEach((r, i) => { sv[`${prefix}${i + 1}Payer`] = r.payer || 'Payer'; sv[`${prefix}${i + 1}Amount`] = r.amount; });
      if (rows.length > max) {
        const rest = rows.slice(max - 1);
        sv[`${prefix}${max}Payer`] = `${rest.length} other payers (see statement)`;
        sv[`${prefix}${max}Amount`] = rest.reduce((t, r) => t + r.amount, 0);
      }
    };
    listRows(b.interest.filter((r) => r.amount !== 0), 'int', 14);
    listRows(b.dividends.filter((r) => r.amount !== 0), 'div', 15);
    Object.assign(sv, { '7aYes': b.line7a, '7aNo': !b.line7a, '8No': true });
    if (b.line7a) Object.assign(sv, { fbarYes: b.line7aFbarRequired, fbarNo: !b.line7aFbarRequired, '7b': b.line7b.join(', ') });
    add('f1040sb', sv);
  }

  // ---------------------------------------------------------------- Schedule D and Form 8949
  if (c.scheduleD.required) {
    const d = c.scheduleD;
    const dv: Record<string, CellValue> = { ...header, qofNo: true, '6': -d.line6, '7': n0(d.line7), '13': d.line13, '14': -d.line14, '15': n0(d.line15), '16': n0(d.line16) };
    const lineFor: Record<string, string> = { A: '1b', B: '2', C: '3', D: '8b', E: '9', F: '10' };
    for (const part of d.f8949) {
      const l = lineFor[part.box]!;
      Object.assign(dv, { [`${l}_d`]: part.proceeds, [`${l}_e`]: part.basis, [`${l}_g`]: part.adjustment, [`${l}_h`]: n0(part.gain) });
    }
    if (d.line16 > 0) {
      const bothGains = d.line15 > 0;
      Object.assign(dv, { '17Yes': bothGains, '17No': !bothGains });
      if (bothGains) dv['20Yes'] = true;
    }
    if (d.line16 < 0) dv['21'] = -d.line21;
    if (d.line16 <= 0 || d.line15 <= 0) Object.assign(dv, { '22Yes': f.line3a > 0, '22No': f.line3a === 0 });
    add('f1040sd', dv);

    // One Form 8949 per box; a page holds 14 rows, so long lists continue on extra copies.
    let copy = 0;
    for (const part of d.f8949) {
      const short = part.box <= 'C';
      const prefix = short ? 'st' : 'lt';
      for (let start = 0; start < part.rows.length; start += F8949_ROWS) {
        const rows = part.rows.slice(start, start + F8949_ROWS);
        const pv: Record<string, CellValue> = { [short ? 'name' : 'name2']: names, [short ? 'ssn' : 'ssn2']: id.ssn, [`box${part.box}`]: true };
        rows.forEach((r, i) => {
          const k = `${prefix}${i + 1}`;
          Object.assign(pv, {
            [`${k}a`]: r.description, [`${k}b`]: mdy(r.dateAcquired), [`${k}c`]: mdy(r.dateSold),
            [`${k}d`]: n0(r.proceeds), [`${k}e`]: n0(r.basis), [`${k}f`]: r.code, [`${k}g`]: r.adjustment, [`${k}h`]: n0(r.gain),
          });
        });
        const sumOf = (key: 'proceeds' | 'basis' | 'adjustment' | 'gain'): number => rows.reduce((t, r) => t + r[key], 0);
        Object.assign(pv, { [`${prefix}_d`]: n0(sumOf('proceeds')), [`${prefix}_e`]: n0(sumOf('basis')), [`${prefix}_g`]: sumOf('adjustment'), [`${prefix}_h`]: n0(sumOf('gain')) });
        add('f8949', pv, { copy: copy++, pages: [short ? 0 : 1] });
      }
    }
  }

  // ---------------------------------------------------------------- Schedule SE
  c.scheduleSE.forEach((s, i) => {
    const who = s.owner === 'spouse' && ret.spouse ? ret.spouse : ret.taxpayer;
    const ssWages = ret.w2s.filter((w) => w.owner === s.owner).reduce((t, w) => t + Math.round(w.box3), 0);
    const base = p.socialSecurityWageBase;
    add('f1040sse', {
      name: fullName(who), ssn: s.owner === 'spouse' ? id.spouseSsn : id.ssn,
      '2': s.netProfit, '3': n0(s.netProfit), '4a': n0(s.line4a), '4c': n0(s.line4a), '6': n0(s.line4a), '7': n0(base),
      '8a': ssWages, '8d': ssWages, '9': n0(max0(base - ssWages)), '10': n0(s.socialSecurityTax), '11': n0(s.medicareTax), '12': n0(s.line12), '13': n0(s.line13),
    }, { copy: i });
  });

  // ---------------------------------------------------------------- Schedule 1-A
  if (has('Schedule 1-A')) {
    const s = c.schedule1A;
    const sp = p.schedule1A;
    const magi = f.line11;
    const tipsRaw = Math.min(ret.w2s.reduce((t, w) => t + Math.round(w.qualifiedTips), 0), sp.tipsMax);
    const otRaw = Math.min(ret.w2s.reduce((t, w) => t + Math.round(w.qualifiedOvertime), 0), sp.overtimeMax[ps]);
    const over = max0(magi - sp.tipsOvertimePhaseoutStart[ps]);
    const thousands = Math.floor(over / 1000);
    const carRaw = Math.min(Math.round(ret.schedule1A.carLoanInterest), sp.carLoanMax);
    const carOver = max0(magi - sp.carLoanPhaseoutStart[ps]);
    const carThousands = Math.ceil(carOver / 1000);
    const seniorOver = max0(magi - sp.seniorPhaseoutStart[ps]);
    const seniorEach = max0(sp.senior - pct(seniorOver, sp.seniorPhaseoutRate));
    const tipW2s = ret.w2s.filter((w) => w.qualifiedTips > 0);
    const otW2s = ret.w2s.filter((w) => w.qualifiedOvertime > 0);
    const sv: Record<string, CellValue> = { ...header, '1': n0(magi), '3': n0(magi) };
    if (year >= 2026) {
      tipW2s.slice(0, 5).forEach((w, i) => Object.assign(sv, { [`tip${i + 1}Employer`]: w.employer, [`tip${i + 1}W2`]: w.qualifiedTips, [`tip${i + 1}Larger`]: w.qualifiedTips }));
      otW2s.slice(0, 5).forEach((w, i) => Object.assign(sv, { [`ot${i + 1}Employer`]: w.employer, [`ot${i + 1}Amount`]: w.qualifiedOvertime }));
      if (tipW2s.length) Object.assign(sv, { '5': tipsRaw, '8': tipsRaw, '9': tipsRaw, '10': magi, '11': sp.tipsOvertimePhaseoutStart[ps], '12': over, '13': thousands, '14': thousands * sp.tipsOvertimePhaseoutPer1000, '15': n0(s.tips) });
      if (otW2s.length) Object.assign(sv, { '17': otRaw, '20': otRaw, '21': otRaw, '22': magi, '23': sp.tipsOvertimePhaseoutStart[ps], '24': over, '25': thousands, '26': thousands * sp.tipsOvertimePhaseoutPer1000, '27': n0(s.overtime) });
      if (carRaw) Object.assign(sv, { '29': carRaw, '30': carRaw, '31': magi, '32': sp.carLoanPhaseoutStart[ps], '33': carOver, '34': carThousands, '35': carThousands * sp.carLoanPhaseoutPer1000, '36': n0(s.carLoanInterest) });
      if (s.senior || ret.taxpayer.age65OrOlder || ret.spouse?.age65OrOlder) {
        Object.assign(sv, { '37': magi, '38': sp.seniorPhaseoutStart[ps], '39': seniorOver, '40': pct(seniorOver, sp.seniorPhaseoutRate), '41': seniorEach, '42a': ret.taxpayer.age65OrOlder ? seniorEach : 0, '42b': married && ret.spouse?.age65OrOlder ? seniorEach : 0, '43': n0(s.senior) });
      }
    } else {
      if (tipW2s.length) Object.assign(sv, { '4a': tipsRaw, '4c': tipsRaw, '6': tipsRaw, '7': tipsRaw, '8': magi, '9': sp.tipsOvertimePhaseoutStart[ps], '10': over, '11': thousands, '12': thousands * sp.tipsOvertimePhaseoutPer1000, '13': n0(s.tips) });
      if (otW2s.length) Object.assign(sv, { '14a': otRaw, '14c': otRaw, '15': otRaw, '16': magi, '17': sp.tipsOvertimePhaseoutStart[ps], '18': over, '19': thousands, '20': thousands * sp.tipsOvertimePhaseoutPer1000, '21': n0(s.overtime) });
      if (carRaw) Object.assign(sv, { car1: carRaw, '23': carRaw, '24': carRaw, '25': magi, '26': sp.carLoanPhaseoutStart[ps], '27': carOver, '28': carThousands, '29': carThousands * sp.carLoanPhaseoutPer1000, '30': n0(s.carLoanInterest) });
      if (s.senior || ret.taxpayer.age65OrOlder || ret.spouse?.age65OrOlder) {
        Object.assign(sv, { '31': magi, '32': sp.seniorPhaseoutStart[ps], '33': seniorOver, '34': pct(seniorOver, sp.seniorPhaseoutRate), '35': seniorEach, '36a': ret.taxpayer.age65OrOlder ? seniorEach : 0, '36b': married && ret.spouse?.age65OrOlder ? seniorEach : 0, '37': n0(s.senior) });
      }
    }
    sv.total = n0(s.total);
    add('f1040s1a', sv);
  }

  // ---------------------------------------------------------------- Schedule 8812
  if (has('Schedule 8812')) {
    const s = c.schedule8812;
    const threshold = p.ctc.phaseoutStart[ps];
    const over = max0(f.line11 - threshold);
    const credits = s.line5;
    const kidsCredit = s.qualifyingChildren * p.ctc.perChild;
    const othersCredit = s.otherDependents * p.ctc.otherDependent;
    const earned = f.line1z + max0(c.schedule1.line3) - c.schedule1.line15;
    const unused = s.line12 - s.line14;
    const refundableCap = s.qualifyingChildren * p.ctc.refundableMax;
    const sv: Record<string, CellValue> = {
      ...header, '1': n0(f.line11), '3': n0(f.line11), '4': String(s.qualifyingChildren), '5': kidsCredit, '6': String(s.otherDependents), '7': othersCredit, '8': n0(credits),
      '9': n0(threshold), '10': n0(over > 0 ? Math.ceil(over / 1000) * 1000 : 0), '11': n0(s.line9), '12': n0(s.line12), '12Yes': s.line12 > 0, '12No': s.line12 === 0,
      '13': n0(max0(f.line18 - f.line20)), '14': n0(s.line14),
    };
    if (unused > 0 && s.qualifyingChildren > 0) {
      const line19 = max0(earned - p.ctc.earnedIncomeFloor);
      Object.assign(sv, {
        '16a': unused, '16bCount': String(s.qualifyingChildren), '16b': refundableCap, '17': Math.min(unused, refundableCap), '18a': earned,
        '19Yes': earned > p.ctc.earnedIncomeFloor, '19No': earned <= p.ctc.earnedIncomeFloor, '19': line19, '20': pct(line19, p.ctc.refundableRate), '27': n0(s.line27),
      });
    }
    add('f1040s8', sv);
  }

  // ---------------------------------------------------------------- Form 8959
  if (c.f8959.required) {
    const m = c.f8959;
    const threshold = p.additionalMedicare.threshold[ps];
    const common = { ...header, '1': m.line1, '4': n0(m.line1), '5': n0(threshold), '6': n0(m.line6), '7': n0(m.line7), '19': m.line19, '20': n0(m.line1), '21': n0(m.line20), '22': n0(m.line22), '24': n0(m.line24) };
    if (year >= 2026) {
      add('f8959', { ...common, '12': n0(m.line7), '13': m.line8, '14': m.line8 ? n0(threshold) : 0, '15': m.line8 ? n0(m.line1) : 0, '16': m.line8 ? n0(max0(threshold - m.line1)) : 0, '17': m.line8 ? n0(max0(m.line8 - max0(threshold - m.line1))) : 0, '18': m.line8 ? n0(m.line13) : 0 });
    } else {
      add('f8959', { ...common, '8': m.line8, '9': m.line8 ? n0(threshold) : 0, '10': m.line8 ? n0(m.line1) : 0, '11': m.line8 ? n0(max0(threshold - m.line1)) : 0, '12': m.line8 ? n0(max0(m.line8 - max0(threshold - m.line1))) : 0, '13': m.line8 ? n0(m.line13) : 0, '18': n0(m.line18) });
    }
  }

  // ---------------------------------------------------------------- Form 8960
  if (c.f8960.required) {
    const n = c.f8960;
    add('f8960', { ...header, '1': n.line1, '2': n.line2, '5a': n.line5a, '5d': n.line5a, '8': n0(n.line8), '11': '0', '12': n0(n.line12), '13': n0(n.line13), '14': n0(n.line14), '15': n0(n.line15), '16': n0(n.line16), '17': n0(n.line17) });
  }

  // ---------------------------------------------------------------- Form 8995
  if (c.f8995.required) {
    const q = c.f8995;
    const biz = ret.scheduleC[0];
    const common = {
      ...header, biz1Name: biz?.name ?? '', biz1Tin: biz ? (biz.owner === 'spouse' ? id.spouseSsn : id.ssn) : '', biz1Qbi: q.line2,
      '2': n0(q.line2), '4': n0(max0(q.line2)), '5': n0(q.line5), '6': q.line6, '8': n0(q.line6), '9': n0(q.line9), '10': n0(q.line10),
      '11': n0(q.line11), '12': q.line12, '13': n0(max0(q.line11 - q.line12)), '14': n0(q.line14), '15': n0(q.line15),
    };
    add('f8995', year >= 2026 ? { ...common, '17': n0(q.line15), '18': q.qbiLossCarryforward } : { ...common, '16': q.qbiLossCarryforward });
  }

  // ---------------------------------------------------------------- Form 1116
  if (c.f1116?.required) {
    const t = c.f1116;
    const countries = [...new Set([
      ...ret.int1099s.filter((i) => i.foreignCountry.trim()).map((i) => i.foreignCountry.trim()),
      ...ret.inheritedProperty.map((i) => i.country.trim()).filter(Boolean),
    ])];
    const country = countries.length === 1 ? countries[0]! : countries.length ? 'Various' : 'RIC';
    const foreignDividends = ret.div1099s.filter((d) => d.box7 > 0).reduce((s, d) => s + Math.round(d.box7), 0);
    const foreignInterestTax = ret.int1099s.reduce((s, i) => s + Math.round(i.foreignTaxPaid), 0);
    const otherTax = t.line8 - foreignDividends - foreignInterestTax;
    const common: Record<string, CellValue> = {
      ...header, passive: true, residentOf: 'United States', countryA: country,
      '1aDesc': 'Passive income: dividends, interest, capital gains', '1aA': n0(t.line1a), '1a': n0(t.line1a),
      '3aA': t.line3a, '3bA': t.line3b, '3cA': t.line3c, '3dA': t.line3d, '3eA': t.line3e, '3fA': t.line3f.toFixed(4), '3gA': t.line3g,
      '4aA': t.line4a, '5A': t.line5, '6A': n0(t.line6), '6': n0(t.line6), '7': n0(t.line7),
      paid: true, rowADate: 'Various', rowATotal: n0(t.line8), '8': n0(t.line8),
      '9': n0(t.line8), '10': t.line10, '11': n0(t.line8 + t.line10), '14': n0(t.line14), '15': n0(t.line15), '17': n0(t.line17), '18': n0(t.line18), '19': t.line19.toFixed(4),
      '20': n0(t.line20), '21': n0(t.line21), '23': n0(t.line23), '24': n0(t.line24), '27': n0(t.line24), '32': n0(t.line24), '33': n0(t.line35), '35': n0(t.line35),
    };
    if (year < 2026) Object.assign(common, { rowADividends: foreignDividends, rowAInterest: foreignInterestTax, rowAOther: otherTax });
    add('f1116', common);
  }

  // ---------------------------------------------------------------- Form 8938
  if (c.f8938.required) {
    const g = c.f8938;
    const deposits = g.partV.filter((a) => a.kind === 'deposit');
    const custodial = g.partV.filter((a) => a.kind === 'custodial');
    const sumMax = (xs: typeof g.partV): number => xs.reduce((s, a) => s + a.maxValueUsd, 0);
    const first: Record<string, CellValue> = {
      year: String(ret.taxYear % 100), name: names, ssn: id.ssn, individual: true,
      '5': String(deposits.length), '6': n0(sumMax(deposits)), '7': String(custodial.length), '8': n0(sumMax(custodial)),
      '9Yes': g.partI.line9AnyClosed, '9No': !g.partI.line9AnyClosed, '10': '0', '11': '0', '12No': true,
      '13aAmount': g.partIII.interest, '13aForm': g.partIII.interest ? 'Form 1040, line 2b' : '',
      '13bAmount': g.partIII.dividends, '13bForm': g.partIII.dividends ? 'Form 1040, line 3b' : '',
      '13eAmount': g.partIII.gains, '13eForm': g.partIII.gains ? 'Schedule D' : '',
    };
    g.partV.forEach((a, i) => {
      const foreign = a.currency.toUpperCase() !== 'USD';
      const acct: Record<string, CellValue> = {
        deposit: a.kind === 'deposit', custodial: a.kind === 'custodial', '21': a.accountNumber,
        opened: a.openedThisYear, closed: a.closedThisYear, jointSpouse: a.jointWithSpouse, '23': n0(a.maxValueUsd),
        '24Yes': foreign, '24No': !foreign, '25a': foreign ? a.currency : '', '25b': foreign ? String(a.treasuryRate) : '',
        '26a': a.institution, '27': a.address, '28': a.country,
      };
      if (i === 0) add('f8938', { ...first, ...acct });
      else add('f8938', acct, { copy: i, pages: [1] });
    });
    if (g.partV.length === 0) add('f8938', first);
  }

  // ---------------------------------------------------------------- Form 3520 (filed separately)
  if (c.f3520.required) {
    const t = c.f3520;
    const sv: Record<string, CellValue> = {
      year: String(ret.taxYear % 100), initial: true, individual: true, partIV: true,
      name: names, ssn: id.ssn, street: `${id.street} ${id.apt}`.trim(), spouseSsn: married ? id.spouseSsn : '', city: id.city, state: id.state, zip: id.zip, country: 'United States',
      joint: married, ...Object.fromEntries(Object.entries(yes(t.line54.required)).map(([k, b]) => [`54${k}`, b])),
      ...Object.fromEntries(Object.entries(yes(t.line55.required)).map(([k, b]) => [`55${k}`, b])), '56No': true,
    };
    if (t.line54.required) {
      t.line54.gifts.slice(0, 3).forEach((gf, i) => Object.assign(sv, { [`g${i + 1}Date`]: mdy(gf.date), [`g${i + 1}Desc`]: `${gf.description} from ${gf.donorName} (${gf.donorType}, ${gf.donorCountry})`.trim(), [`g${i + 1}Fmv`]: n0(gf.fmvUsd) }));
      sv['54Total'] = n0(t.line54.total);
    }
    if (t.line55.required) {
      t.line55.gifts.slice(0, 4).forEach((gf, i) => Object.assign(sv, { [`c${i + 1}Date`]: mdy(gf.date), [`c${i + 1}Name`]: gf.donorName, [`c${i + 1}Address`]: gf.donorCountry, [`c${i + 1}Corp`]: gf.donorType === 'corporation', [`c${i + 1}Partnership`]: gf.donorType === 'partnership', [`c${i + 1}Desc`]: gf.description, [`c${i + 1}Fmv`]: n0(gf.fmvUsd) }));
    }
    add('f3520', sv);
  }

  return out;
};

export { fmtWhole };
