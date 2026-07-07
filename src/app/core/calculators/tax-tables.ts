import { FilingStatus, TaxBracket } from '../models/retirement.models';

// Tax year 2026 per IRS Rev. Proc. 2025-32 (Oct 2025, reflects OBBBA amendments).
// Note the bottom two brackets received an extra inflation adjustment under OBBBA.
export const TAX_TABLES: Record<number, Record<FilingStatus, { standardDeduction: number; brackets: TaxBracket[] }>> = {
  2026: {
    single: {
      standardDeduction: 16100,
      brackets: [
        { rate: 0.1, min: 0, max: 12400 },
        { rate: 0.12, min: 12400, max: 50400 },
        { rate: 0.22, min: 50400, max: 105700 },
        { rate: 0.24, min: 105700, max: 201775 },
        { rate: 0.32, min: 201775, max: 256225 },
        { rate: 0.35, min: 256225, max: 640600 },
        { rate: 0.37, min: 640600, max: Number.POSITIVE_INFINITY },
      ],
    },
    married_filing_jointly: {
      standardDeduction: 32200,
      brackets: [
        { rate: 0.1, min: 0, max: 24800 },
        { rate: 0.12, min: 24800, max: 100800 },
        { rate: 0.22, min: 100800, max: 211400 },
        { rate: 0.24, min: 211400, max: 403550 },
        { rate: 0.32, min: 403550, max: 512450 },
        { rate: 0.35, min: 512450, max: 768700 },
        { rate: 0.37, min: 768700, max: Number.POSITIVE_INFINITY },
      ],
    },
  },
};

export const DEFAULT_TAX_YEAR = 2026;

// The IRS inflation-indexes brackets and the standard deduction annually. Simulated future
// years scale the base-year table by this rate so nominal balance/expense growth doesn't
// create artificial bracket creep (which would overstate the benefit of converting early).
export const BRACKET_INFLATION_RATE = 0.03;

export function getTaxTable(year: number, filingStatus: FilingStatus, inflationFactor = 1) {
  const base = TAX_TABLES[year]?.[filingStatus] ?? TAX_TABLES[DEFAULT_TAX_YEAR][filingStatus];
  if (inflationFactor === 1) return base;
  return {
    standardDeduction: base.standardDeduction * inflationFactor,
    brackets: base.brackets.map((bracket) => ({
      rate: bracket.rate,
      min: bracket.min * inflationFactor,
      max: Number.isFinite(bracket.max) ? bracket.max * inflationFactor : bracket.max,
    })),
  };
}

// Medicare IRMAA: combined Part B + Part D monthly surcharges per person for 2026
// (CMS 2026 announcement: Part B standard $202.90, surcharges $81.20–$487.00;
// Part D surcharges $14.50–$91.00). Premiums are cliff-based: crossing a MAGI
// threshold by $1 incurs the full tier surcharge, based on MAGI from two years prior.
export interface IrmaaTier {
  magiThreshold: number;
  monthlySurchargePerPerson: number;
}

export const IRMAA_TIERS: Record<FilingStatus, IrmaaTier[]> = {
  single: [
    { magiThreshold: 109000, monthlySurchargePerPerson: 95.7 },
    { magiThreshold: 137000, monthlySurchargePerPerson: 240.3 },
    { magiThreshold: 171000, monthlySurchargePerPerson: 385.0 },
    { magiThreshold: 205000, monthlySurchargePerPerson: 529.7 },
    { magiThreshold: 500000, monthlySurchargePerPerson: 578.0 },
  ],
  married_filing_jointly: [
    { magiThreshold: 218000, monthlySurchargePerPerson: 95.7 },
    { magiThreshold: 274000, monthlySurchargePerPerson: 240.3 },
    { magiThreshold: 342000, monthlySurchargePerPerson: 385.0 },
    { magiThreshold: 410000, monthlySurchargePerPerson: 529.7 },
    { magiThreshold: 750000, monthlySurchargePerPerson: 578.0 },
  ],
};

export function irmaaAnnualSurcharge(magi: number, filingStatus: FilingStatus): number {
  const persons = filingStatus === 'married_filing_jointly' ? 2 : 1;
  let monthly = 0;
  for (const tier of IRMAA_TIERS[filingStatus]) {
    if (magi > tier.magiThreshold) monthly = tier.monthlySurchargePerPerson;
  }
  return Math.round(monthly * 12 * persons * 100) / 100;
}
