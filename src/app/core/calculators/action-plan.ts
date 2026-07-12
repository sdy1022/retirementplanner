import { FilingStatus, ScenarioResult, YearResult } from '../models/retirement.models';
import { calculateTax } from './tax-bracket-calculator';
import { BRACKET_INFLATION_RATE, getTaxTable } from './tax-tables';

export interface ActionStep {
  age: number;
  action: string;
  marginalBracket: string;
  totalTax: string;
  fundingSource: string;
  status: 'info' | 'success' | 'warning' | 'danger';
}

// Names the accounts each dollar of expenses and taxes actually came from this year
function fundingBreakdown(year: YearResult): string {
  const money = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const expenseParts = [
    year.expensesFromSs > 0 ? `SS ${money(year.expensesFromSs)}` : '',
    year.expensesFromRmd > 0 ? `RMD ${money(year.expensesFromRmd)}` : '',
    year.expensesFromTraditional > 0 ? `Trad ${money(year.expensesFromTraditional)}` : '',
    year.expensesFromBrokerage > 0 ? `Brok ${money(year.expensesFromBrokerage)}` : '',
    year.expensesFromRoth > 0 ? `Roth ${money(year.expensesFromRoth)}` : '',
  ].filter(Boolean);
  const taxParts = [
    (year.taxFromSbloc ?? 0) > 0 ? `SBLOC loan ${money(year.taxFromSbloc!)}` : '',
    year.taxFromBrokerage > 0 ? `Brok ${money(year.taxFromBrokerage)}` : '',
    year.taxWithheldFromConversion > 0 ? `Withheld ${money(year.taxWithheldFromConversion)}` : '',
    year.taxFromTraditional > 0 ? `Trad ${money(year.taxFromTraditional)}` : '',
    year.taxFromRoth > 0 ? `Roth ${money(year.taxFromRoth)}` : '',
  ].filter(Boolean);
  const msgs = [];
  if (expenseParts.length > 0) msgs.push(`Exp: ${expenseParts.join(', ')}`);
  if (taxParts.length > 0) msgs.push(`Tax: ${taxParts.join(', ')}`);
  return msgs.join(' | ');
}

export function generateActionPlan(result: ScenarioResult, filingStatus: FilingStatus, taxYear: number = 2026): ActionStep[] {
  const steps: ActionStep[] = [];
  const startAge = result.years[0]?.age ?? 0;

  for (const year of result.years) {
    const inflationFactor = Math.pow(1 + BRACKET_INFLATION_RATE, year.age - startAge);
    const table = getTaxTable(taxYear, filingStatus, inflationFactor);
    
    let actionStr = '';
    const marginalBracketStr = `${Math.round(year.marginalRate * 100)}%`;
    let totalTaxStr = year.totalTax > 0 ? `$${Math.round(year.totalTax).toLocaleString()}` : '$0';
    if (year.irmaa > 0) {
      totalTaxStr += ` (+ $${Math.round(year.irmaa).toLocaleString()} IRMAA)`;
    }
    
    const fundingSourceStr = fundingBreakdown(year);
    let status: ActionStep['status'] = 'info';

    if (year.shortfall > 0) {
      status = 'danger';
      actionStr = `⚠ Underfunded: $${Math.round(year.shortfall).toLocaleString()} could not be covered.`;
    } else if (year.conversion > 0) {
      // Conversion year
      const baseGross = year.taxableIncome - year.conversion;
      const taxWithout = calculateTax(baseGross, filingStatus, taxYear, inflationFactor);
      const taxWith = calculateTax(year.taxableIncome, filingStatus, taxYear, inflationFactor);
      const conversionTax = taxWith - taxWithout;
      const effectiveRate = year.conversion > 0 ? conversionTax / year.conversion : 0;
      
      const baseTaxable = Math.max(0, baseGross - table.standardDeduction);
      const endTaxable = Math.max(0, year.taxableIncome - table.standardDeduction);
      const startBracket = table.brackets.find(b => baseTaxable >= b.min && baseTaxable <= b.max);
      const endBracket = table.brackets.find(b => endTaxable >= b.min && endTaxable <= b.max);
      
      const startRate = Math.round((startBracket?.rate ?? 0) * 100);
      const endRate = Math.round((endBracket?.rate ?? 0) * 100);
      const effectivePct = Math.round(effectiveRate * 100);
      
      actionStr = `Convert $${Math.round(year.conversion).toLocaleString()} to Roth`;
      if (startRate === endRate) {
        actionStr += ` (within ${endRate}%, effective ${effectivePct}%)`;
      } else {
        actionStr += ` (spans ${startRate}%–${endRate}%, effective ${effectivePct}%)`;
      }
      
      const grossBracketCeiling = (endBracket?.max ?? Infinity) + table.standardDeduction;
      const amountToTop = grossBracketCeiling - year.taxableIncome;
      if (amountToTop < 1000 && (endBracket?.rate ?? 0) > 0.12) {
        actionStr += ` (Fills ${endRate}%)`;
      }
    } else if (year.rmd > 0) {
      // RMD year
      const rmdSpill = year.marginalRate >= 0.32;
      actionStr = `RMD of $${Math.round(year.rmd).toLocaleString()}`;
      if (rmdSpill) {
        status = 'warning';
        actionStr = `⚠ RMD pushes to ${Math.round(year.marginalRate * 100)}% bracket!`;
      } else {
        status = 'success';
      }
    } else if (year.livingExpenses > 0 || year.age >= 60) {
      actionStr = `No conversion/RMD.`;
      if (year.livingExpenses > 0) {
        actionStr += ` Funded $${Math.round(year.livingExpenses).toLocaleString()} living expenses.`;
      }
    } else {
      continue;
    }

    if (actionStr) {
      steps.push({
        age: year.age,
        action: actionStr,
        marginalBracket: marginalBracketStr,
        totalTax: totalTaxStr,
        fundingSource: fundingSourceStr,
        status
      });
    }
  }

  return steps;
}

export function calculateMaxTraditionalBalanceForBracket(
  targetBracket: number,
  ssIncome: number,
  rmdDivisor: number,
  filingStatus: FilingStatus,
  taxYear: number = 2026
): number {
  const table = getTaxTable(taxYear, filingStatus);
  const bracket = table.brackets.find(b => b.rate === targetBracket);
  if (!bracket) return 0;

  const targetGrossCeiling = bracket.max + table.standardDeduction;
  const maxRmd = Math.max(0, targetGrossCeiling - ssIncome);
  return maxRmd * rmdDivisor;
}

export function calculateRequiredFlatConversion(
  currentBalance: number,
  targetBalance: number,
  years: number,
  returnRate: number
): number {
  if (years <= 0) return 0;
  if (returnRate === 0) return Math.max(0, (currentBalance - targetBalance) / years);
  
  const fvNoConversions = currentBalance * Math.pow(1 + returnRate, years);
  if (fvNoConversions <= targetBalance) return 0;
  
  const excess = fvNoConversions - targetBalance;
  // Future value of an annuity due (payments at start of year, since engine subtracts conversion before growth)
  const annuityFactor = (Math.pow(1 + returnRate, years) - 1) / returnRate * (1 + returnRate);
  
  return excess / annuityFactor;
}
