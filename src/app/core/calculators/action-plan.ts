import { FilingStatus, ScenarioResult } from '../models/retirement.models';
import { calculateTax } from './tax-bracket-calculator';
import { BRACKET_INFLATION_RATE, getTaxTable } from './tax-tables';

export interface ActionStep {
  age: number;
  message: string;
  status: 'info' | 'success' | 'warning' | 'danger';
}

export function generateActionPlan(result: ScenarioResult, filingStatus: FilingStatus, taxYear: number = 2026): ActionStep[] {
  const steps: ActionStep[] = [];
  const startAge = result.years[0]?.age ?? 0;
  const firstRmdAge = result.years.find(y => y.rmd > 0)?.age;

  for (const year of result.years) {
    // Match the engine's per-year bracket indexing so reported rates agree with the simulation
    const inflationFactor = Math.pow(1 + BRACKET_INFLATION_RATE, year.age - startAge);
    const table = getTaxTable(taxYear, filingStatus, inflationFactor);
    const bracketMsg = ` Current bracket: ${Math.round(year.marginalRate * 100)}%.`;
    if (year.conversion > 0) {
      // Compute effective federal rate on conversion only (marginal blend)
      const baseGross = year.taxableIncome - year.conversion;
      const taxWithout = calculateTax(baseGross, filingStatus, taxYear, inflationFactor);
      const taxWith = calculateTax(year.taxableIncome, filingStatus, taxYear, inflationFactor);
      const conversionTax = taxWith - taxWithout;
      const effectiveRate = year.conversion > 0 ? conversionTax / year.conversion : 0;

      // Determine which brackets the conversion spans
      const baseTaxable = Math.max(0, baseGross - table.standardDeduction);
      const endTaxable = Math.max(0, year.taxableIncome - table.standardDeduction);
      const startBracket = table.brackets.find(b => baseTaxable >= b.min && baseTaxable <= b.max);
      const endBracket = table.brackets.find(b => endTaxable >= b.min && endTaxable <= b.max);

      const startRate = Math.round((startBracket?.rate ?? 0) * 100);
      const endRate = Math.round((endBracket?.rate ?? 0) * 100);
      const effectivePct = Math.round(effectiveRate * 100);

      let msg = `Convert $${year.conversion.toLocaleString()} to Roth`;
      if (startRate === endRate) {
        msg += ` (entirely within ${endRate}% bracket, effective rate ${effectivePct}%).`;
      } else {
        msg += ` (spans ${startRate}%–${endRate}% brackets, effective rate ${effectivePct}%).`;
      }

      // Check if we're near the bracket ceiling
      const grossBracketCeiling = (endBracket?.max ?? Infinity) + table.standardDeduction;
      const amountToTop = grossBracketCeiling - year.taxableIncome;
      if (amountToTop < 1000 && (endBracket?.rate ?? 0) > 0.12) {
        msg += ` Fills to top of ${endRate}%.`;
      }

      if (year.totalTax > 0) {
        msg += ` Total tax (fed+state) ≈ $${year.totalTax.toLocaleString()}.`;
      }
      if (year.irmaa > 0) {
        msg += ` Medicare IRMAA Surcharge: $${year.irmaa.toLocaleString()}.`;
      }
      if (year.livingExpenses > 0) {
        msg += ` Funded $${year.livingExpenses.toLocaleString()} in living expenses.`;
      }
      msg += bracketMsg;

      steps.push({ age: year.age, message: msg, status: 'info' });
    }

    if (year.rmd > 0) {
      const rmdSpill = year.marginalRate >= 0.32;
      const expenseMsg = year.livingExpenses > 0 ? ` Funded $${year.livingExpenses.toLocaleString()} in living expenses.` : '';
      const taxMsg = year.totalTax > 0 ? ` Total tax (fed+state) ≈ $${year.totalTax.toLocaleString()}.` : '';
      const irmaaMsg = year.irmaa > 0 ? ` Medicare IRMAA Surcharge: $${year.irmaa.toLocaleString()}.` : '';
      if (rmdSpill) {
        steps.push({
          age: year.age,
          message: `⚠ RMD of $${year.rmd.toLocaleString()} pushes you into the ${Math.round(year.marginalRate * 100)}% bracket! Consider increasing earlier conversions.` + expenseMsg + taxMsg + irmaaMsg,
          status: 'warning'
        });
      } else {
        steps.push({
          age: year.age,
          message: `✓ RMD of $${year.rmd.toLocaleString()} stays within the ${Math.round(year.marginalRate * 100)}% band.` + expenseMsg + taxMsg + irmaaMsg,
          status: 'success'
        });
      }
    } else if (year.conversion === 0 && (year.livingExpenses > 0 || year.age >= 60)) {
      const expenseMsg = year.livingExpenses > 0 ? ` Funded $${year.livingExpenses.toLocaleString()} in living expenses.` : '';
      const taxMsg = year.totalTax > 0 ? ` Total tax (fed+state) ≈ $${year.totalTax.toLocaleString()}.` : '';
      const irmaaMsg = year.irmaa > 0 ? ` Medicare IRMAA Surcharge: $${year.irmaa.toLocaleString()}.` : '';
      steps.push({
        age: year.age,
        message: `No conversion or RMD required this year.` + expenseMsg + taxMsg + irmaaMsg + bracketMsg,
        status: 'info'
      });
    }

    if (year.shortfall > 0) {
      steps.push({
        age: year.age,
        message: `⚠ Underfunded: $${year.shortfall.toLocaleString()} of expenses/taxes could not be covered by any account this year. The plan is not feasible as modeled.`,
        status: 'danger'
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
