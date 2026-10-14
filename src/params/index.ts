import { params2025 } from './2025';
import { params2026 } from './2026';
import type { TaxParams } from './types';

export type { TaxParams, FilingStatus, ParamStatus, ByStatus, Bracket } from './types';
export { paramStatus } from './types';

const byYear: Record<number, TaxParams> = { 2025: params2025, 2026: params2026 };

export const paramsFor = (year: number): TaxParams => {
  const p = byYear[year];
  if (!p) throw new Error(`No parameters for tax year ${year}`);
  return p;
};

export const supportedYears = Object.keys(byYear).map(Number);
