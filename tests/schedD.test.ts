import { describe, expect, it } from 'vitest';
import { scheduleD } from '../src/engine/schedD';
import { paramsFor } from '../src/params';
import type { Lot } from '../src/model';

const p = paramsFor(2025);
const lot = (o: Partial<Lot> & Pick<Lot, 'proceeds' | 'basis' | 'term'>): Lot => ({
  description: '', dateAcquired: '', dateSold: '', adjustmentCode: '', adjustment: 0, basisReported: true, ...o,
});
const none = { shortTerm: 0, longTerm: 0 };

describe('Schedule D and Form 8949', () => {
  it('groups lots by term and basis reporting', () => {
    const d = scheduleD(
      [
        lot({ proceeds: 100, basis: 80, term: 'short' }),
        lot({ proceeds: 100, basis: 120, term: 'short', basisReported: false }),
        lot({ proceeds: 1000, basis: 700, term: 'long' }),
        lot({ proceeds: 500, basis: 600, term: 'long', basisReported: false }),
      ],
      none, 0, 'mfj', p,
    );
    expect(d.f8949.map((x) => x.box)).toEqual(['A', 'B', 'D', 'E']);
    expect(d.line1b).toBe(20);
    expect(d.line2).toBe(-20);
    expect(d.line7).toBe(0);
    expect(d.line8b).toBe(300);
    expect(d.line9).toBe(-100);
    expect(d.line15).toBe(200);
    expect(d.line16).toBe(200);
    expect(d.line7Form1040).toBe(200);
  });

  it('applies wash-sale adjustments in column (g)', () => {
    const d = scheduleD([lot({ proceeds: 3000, basis: 5000, adjustmentCode: 'W', adjustment: 500, term: 'long' })], none, 0, 'single', p);
    expect(d.line8b).toBe(-1500);
  });

  it('limits a net loss to $3,000 ($1,500 MFS) and carries the rest forward', () => {
    const lots = [lot({ proceeds: 1000, basis: 6000, term: 'short' }), lot({ proceeds: 1000, basis: 3000, term: 'long' })];
    const d = scheduleD(lots, none, 0, 'mfj', p);
    expect(d.line16).toBe(-7000);
    expect(d.line7Form1040).toBe(-3000);
    expect(d.nextYearCarryover).toEqual({ shortTerm: 2000, longTerm: 2000 });
    const m = scheduleD(lots, none, 0, 'mfs', p);
    expect(m.line7Form1040).toBe(-1500);
  });

  it('includes prior-year carryovers and capital gain distributions', () => {
    const d = scheduleD([], { shortTerm: 1000, longTerm: 2500 }, 400, 'single', p);
    expect(d.required).toBe(true);
    expect(d.line7).toBe(-1000);
    expect(d.line15).toBe(-2100);
    expect(d.line7Form1040).toBe(-3000);
    expect(d.nextYearCarryover).toEqual({ shortTerm: 0, longTerm: 100 });
  });

  it('8949 part totals equal Schedule D lines', () => {
    const d = scheduleD(
      [lot({ proceeds: 2220, basis: 1332, term: 'long' }), lot({ proceeds: 600, basis: 1035, term: 'long' }), lot({ proceeds: 10000, basis: 10000, term: 'long' })],
      none, 0, 'mfj', p,
    );
    const D = d.f8949.find((x) => x.box === 'D')!;
    expect([D.proceeds, D.basis, D.gain]).toEqual([12_820, 12_367, 453]);
    expect(d.line8b).toBe(D.gain);
  });
});
