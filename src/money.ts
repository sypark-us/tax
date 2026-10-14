/**
 * All engine arithmetic is done in whole dollars, which is what the IRS
 * forms carry. Inputs may have cents; each input amount is rounded once at
 * the boundary (IRS allows rounding each entry), and every multiplication
 * result is rounded immediately so floating point drift never reaches a line.
 */

export const r = (x: number): number => Math.round(x);

export const max0 = (x: number): number => (x > 0 ? x : 0);

export const pct = (x: number, rate: number): number => r(x * rate);

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

export const clampMin = (x: number, min: number): number => (x < min ? min : x);

export const fmt = (x: number | undefined | null): string => {
  if (x === undefined || x === null) return '';
  if (x < 0) return `(${Math.abs(x).toLocaleString('en-US')})`;
  return x.toLocaleString('en-US');
};
