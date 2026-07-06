import { FilingStatus, TaxBracket } from '../models/retirement.models';

export const TAX_TABLES: Record<number, Record<FilingStatus, { standardDeduction: number; brackets: TaxBracket[] }>> = {
  2026: {
    single: {
      standardDeduction: 15000,
      brackets: [
        { rate: 0.1, min: 0, max: 11925 },
        { rate: 0.12, min: 11925, max: 48475 },
        { rate: 0.22, min: 48475, max: 103350 },
        { rate: 0.24, min: 103350, max: 197300 },
        { rate: 0.32, min: 197300, max: 250525 },
        { rate: 0.35, min: 250525, max: 626350 },
        { rate: 0.37, min: 626350, max: Number.POSITIVE_INFINITY },
      ],
    },
    married_filing_jointly: {
      standardDeduction: 30000,
      brackets: [
        { rate: 0.1, min: 0, max: 23850 },
        { rate: 0.12, min: 23850, max: 96950 },
        { rate: 0.22, min: 96950, max: 206700 },
        { rate: 0.24, min: 206700, max: 394600 },
        { rate: 0.32, min: 394600, max: 501050 },
        { rate: 0.35, min: 501050, max: 751600 },
        { rate: 0.37, min: 751600, max: Number.POSITIVE_INFINITY },
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

// Medicare IRMAA: combined Part B + Part D monthly surcharges per person (approximate 2026 values).
// Premiums are cliff-based: crossing a MAGI threshold by $1 incurs the full tier surcharge.
export interface IrmaaTier {
  magiThreshold: number;
  monthlySurchargePerPerson: number;
}

export const IRMAA_TIERS: Record<FilingStatus, IrmaaTier[]> = {
  single: [
    { magiThreshold: 106000, monthlySurchargePerPerson: 87.7 },
    { magiThreshold: 133000, monthlySurchargePerPerson: 220.3 },
    { magiThreshold: 167000, monthlySurchargePerPerson: 352.9 },
    { magiThreshold: 200000, monthlySurchargePerPerson: 485.5 },
    { magiThreshold: 500000, monthlySurchargePerPerson: 529.7 },
  ],
  married_filing_jointly: [
    { magiThreshold: 212000, monthlySurchargePerPerson: 87.7 },
    { magiThreshold: 266000, monthlySurchargePerPerson: 220.3 },
    { magiThreshold: 334000, monthlySurchargePerPerson: 352.9 },
    { magiThreshold: 400000, monthlySurchargePerPerson: 485.5 },
    { magiThreshold: 750000, monthlySurchargePerPerson: 529.7 },
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
