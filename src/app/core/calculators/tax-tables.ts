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

export function getTaxTable(year: number, filingStatus: FilingStatus) {
  return TAX_TABLES[year]?.[filingStatus] ?? TAX_TABLES[DEFAULT_TAX_YEAR][filingStatus];
}
