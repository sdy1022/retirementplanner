import { FilingStatus, TaxBracket } from '../models/retirement.models';
import { getTaxTable } from './tax-tables';

export function calculateTax(grossIncome: number, filingStatus: FilingStatus, year: number): number {
  const table = getTaxTable(year, filingStatus);
  const taxableIncome = Math.max(0, grossIncome - table.standardDeduction);

  return roundCurrency(
    table.brackets.reduce((tax, bracket) => {
      const taxableAtBracket = Math.max(0, Math.min(taxableIncome, bracket.max) - bracket.min);
      return tax + taxableAtBracket * bracket.rate;
    }, 0),
  );
}

export function getMarginalBracket(grossIncome: number, filingStatus: FilingStatus, year: number): TaxBracket {
  const table = getTaxTable(year, filingStatus);
  const taxableIncome = Math.max(0, grossIncome - table.standardDeduction);
  return table.brackets.find((bracket) => taxableIncome >= bracket.min && taxableIncome <= bracket.max) ?? table.brackets.at(-1)!;
}

export function amountToFillBracket(grossIncome: number, targetBracketCeiling: number, filingStatus: FilingStatus, year: number): number {
  const table = getTaxTable(year, filingStatus);
  const taxableIncome = Math.max(0, grossIncome - table.standardDeduction);
  return Math.max(0, targetBracketCeiling - taxableIncome);
}

export function ceilingForRate(rate: number, filingStatus: FilingStatus, year: number): number {
  const bracket = getTaxTable(year, filingStatus).brackets.find((entry) => entry.rate === rate);
  return bracket?.max ?? 0;
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
