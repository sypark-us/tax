/**
 * Sales of inherited property. IRC 1014 steps the basis up to the fair
 * market value at the date of death and IRC 1223(9) makes the holding
 * period long-term regardless of how long the heir held it. Form 8949
 * wants "INHERITED" in the date-acquired column. Foreign property has no
 * 1099-B, so the sale lands in Box F. Each amount is converted at the spot
 * rate of its own date (Treas. Reg. 1.988-1, Pub. 54).
 */
import { r } from '../money';
import type { InheritedProperty, Lot } from '../model';

export interface InheritedSale {
  index: number;
  description: string;
  owner: InheritedProperty['owner'];
  country: string;
  currency: string;
  proceedsUsd: number;
  basisUsd: number;
  sellingCostsUsd: number;
  gainUsd: number;
  foreignTaxPaidUsd: number;
  lot: Lot;
}

const usd = (amount: number, unitsPerUsd: number): number => r(amount / unitsPerUsd);

export const inheritedSale = (p: InheritedProperty, index: number): InheritedSale => {
  const proceedsUsd = usd(p.salePrice, p.rateAtSale);
  const basisUsd = usd(p.fmvAtDeath, p.rateAtDeath);
  const sellingCostsUsd = usd(p.sellingCosts, p.rateAtSale);
  const foreignTaxPaidUsd = usd(p.foreignTaxPaid, p.rateAtTaxPayment);
  const lot: Lot = {
    description: p.description || 'Inherited property',
    dateAcquired: 'INHERITED',
    dateSold: p.dateSold,
    proceeds: proceedsUsd,
    basis: basisUsd,
    // Selling costs not reflected in proceeds go in column (g) with code E.
    adjustmentCode: sellingCostsUsd > 0 ? 'E' : '',
    adjustment: -sellingCostsUsd,
    term: 'long',
    basisReported: false,
    reportedOn1099B: false,
  };
  return {
    index,
    description: lot.description,
    owner: p.owner,
    country: p.country,
    currency: p.currency.toUpperCase(),
    proceedsUsd, basisUsd, sellingCostsUsd,
    gainUsd: proceedsUsd - basisUsd - sellingCostsUsd,
    foreignTaxPaidUsd,
    lot,
  };
};

export const inheritedSales = (items: InheritedProperty[]): InheritedSale[] =>
  items.filter((p) => p.salePrice > 0 || p.dateSold).map(inheritedSale);
