import { describe, expect, it } from 'vitest';
import { computeReturn } from '../src/engine';
import { fbar, toUsdRoundedUp } from '../src/engine/fbar';
import { parseReturn } from '../src/model';

const base = { taxYear: 2025 as const, taxpayer: { firstName: 'Alex', lastName: 'Kim' } };
const acct = (over: object) => ({ institution: 'Hana Bank', accountNumber: '123-456', country: 'Korea, South', ...over });

describe('FBAR currency conversion', () => {
  it('converts at the Treasury rate and rounds up to the next dollar', () => {
    // 15,000,000 KRW at 1,470 per USD = 10,204.08 -> 10,205
    expect(toUsdRoundedUp(15_000_000, 1470)).toBe(10_205);
    expect(toUsdRoundedUp(1000, 1)).toBe(1000);
    expect(toUsdRoundedUp(0, 1)).toBe(0);
  });
});

describe('FBAR filing requirement', () => {
  it('is not required at exactly $10,000', () => {
    const ret = parseReturn({ ...base, filingStatus: 'single', foreignAccounts: [acct({ maxValue: 10_000 })] });
    const f = fbar(ret);
    expect(f.hasAccounts).toBe(true);
    expect(f.required).toBe(false);
    expect(f.filings[0]!.aggregateMaxUsd).toBe(10_000);
  });

  it('is required once the aggregate exceeds $10,000, and then lists every account', () => {
    const ret = parseReturn({
      ...base, filingStatus: 'single',
      foreignAccounts: [acct({ maxValue: 9_000 }), acct({ institution: 'Shinhan', maxValue: 1_001 })],
    });
    const f = fbar(ret);
    expect(f.required).toBe(true);
    expect(f.filings[0]!.accounts).toHaveLength(2);
    expect(f.filings[0]!.accounts.map((a) => a.part)).toEqual(['II', 'II']);
  });

  it('treats an unknown balance as requiring a filing', () => {
    const ret = parseReturn({ ...base, filingStatus: 'single', foreignAccounts: [acct({ maxValue: 0, maxValueUnknown: true })] });
    const f = fbar(ret);
    expect(f.required).toBe(true);
    expect(f.filings[0]!.anyValueUnknown).toBe(true);
    expect(f.filings[0]!.accounts[0]!.maxValueUsd).toBe(0);
  });

  it('assigns Parts by ownership and signature authority', () => {
    const ret = parseReturn({
      ...base, filingStatus: 'mfj', spouse: { firstName: 'Sam', lastName: 'Kim' },
      foreignAccounts: [
        acct({ maxValue: 20_000, owner: 'taxpayer' }),
        acct({ institution: 'Joint', maxValue: 5_000, owner: 'joint' }),
        acct({ institution: 'Parent', maxValue: 3_000, owner: 'taxpayer', otherJointOwner: { name: 'Mom Kim', tin: '000-00-0000' } }),
        acct({ institution: 'Employer', maxValue: 100_000, owner: 'spouse', signatureAuthorityOnly: true }),
      ],
    });
    const f = fbar(ret);
    const tp = f.filings.find((x) => x.filer === 'taxpayer')!;
    const sp = f.filings.find((x) => x.filer === 'spouse')!;
    expect(tp.accounts.map((a) => [a.institution, a.part])).toEqual([['Hana Bank', 'II'], ['Joint', 'III'], ['Parent', 'III']]);
    expect(tp.aggregateMaxUsd).toBe(28_000);
    const joint = tp.accounts[1]!;
    expect(joint.jointOwnerCount).toBe(1);
    expect(joint.principalJointOwner).toBe('Sam Kim');
    const parent = tp.accounts[2]!;
    expect(parent.principalJointOwner).toBe('Mom Kim');
    expect(parent.principalJointOwnerTin).toBe('000-00-0000');
    expect(sp.accounts.map((a) => [a.institution, a.part])).toEqual([['Joint', 'III'], ['Employer', 'IV']]);
    expect(sp.aggregateMaxUsd).toBe(105_000);
    expect(sp.required).toBe(true);
    // Spouse has a separately held account, so one FBAR is not allowed.
    expect(f.jointFilingAllowed).toBe(false);
    expect(f.countries).toEqual(['Korea, South']);
  });

  it('allows one joint FBAR when every spouse account is jointly owned', () => {
    const ret = parseReturn({
      ...base, filingStatus: 'mfj', spouse: { firstName: 'Sam', lastName: 'Kim' },
      foreignAccounts: [acct({ maxValue: 12_000, owner: 'joint' }), acct({ institution: 'Mine', maxValue: 500, owner: 'taxpayer' })],
    });
    const f = fbar(ret);
    expect(f.filings.every((x) => x.required)).toBe(true);
    expect(f.jointFilingAllowed).toBe(true);
  });

  it('counts a joint account once in the household aggregate', () => {
    const ret = parseReturn({
      ...base, filingStatus: 'mfj', spouse: { firstName: 'Sam', lastName: 'Kim' },
      foreignAccounts: [acct({ maxValue: 120_000, owner: 'joint' })],
    });
    expect(fbar(ret).aggregateMaxUsd).toBe(120_000);
  });

  it('sets due dates for the year after the tax year', () => {
    const f = fbar(parseReturn({ ...base, taxYear: 2026, filingStatus: 'single', foreignAccounts: [acct({ maxValue: 1 })] }));
    expect(f.dueDate).toBe('2027-04-15');
    expect(f.extendedDueDate).toBe('2027-10-15');
  });
});

describe('FBAR in the computed return', () => {
  it('requires Schedule B Part III for a foreign account even with little interest', () => {
    const c = computeReturn(parseReturn({
      ...base, filingStatus: 'single',
      int1099s: [{ payer: 'Hana Bank', box1: 40 }],
      foreignAccounts: [acct({ maxValue: 2_000 })],
    }));
    expect(c.scheduleB.required).toBe(true);
    expect(c.scheduleB.line7a).toBe(true);
    expect(c.scheduleB.line7aFbarRequired).toBe(false);
    expect(c.scheduleB.line7b).toEqual(['Korea, South']);
    expect(c.attachments).toContain('Schedule B');
    expect(c.separateFilings).toEqual([]);
  });

  it('lists the FBAR as a separate filing and flags Form 8938', () => {
    const c = computeReturn(parseReturn({
      ...base, filingStatus: 'single',
      foreignAccounts: [acct({ maxValue: 120_000_000, currency: 'KRW', treasuryRate: 1470 })],
    }));
    expect(c.fbar.filings[0]!.accounts[0]!.maxValueUsd).toBe(81_633);
    expect(c.separateFilings).toHaveLength(1);
    expect(c.separateFilings[0]).toMatch(/FinCEN Form 114 FBAR: e-file with FinCEN by 2026-04-15/);
    expect(c.attachments).toContain('Form 8938');
    expect(c.f8938.required).toBe(true);
  });

  it('is absent when there are no foreign accounts', () => {
    const c = computeReturn(parseReturn({ ...base, filingStatus: 'single', w2s: [{ box1: 50_000 }] }));
    expect(c.fbar.hasAccounts).toBe(false);
    expect(c.scheduleB.required).toBe(false);
    expect(c.separateFilings).toEqual([]);
    expect(c.attachments).not.toContain('Form 8938');
  });
});
