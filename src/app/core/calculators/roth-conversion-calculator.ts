import { AccountSnapshot, FilingStatus, RothConversionStrategy, YearResult } from '../models/retirement.models';
import { getRmdStartAge, UNIFORM_LIFETIME_DIVISORS } from './rmd-calculator';
import { amountToFillBracket, calculateTax, ceilingForRate, getMarginalBracket, roundCurrency } from './tax-bracket-calculator';
import { getTaxTable } from './tax-tables';

export interface ConversionSimulationInput {
  accounts: AccountSnapshot[];
  strategy: RothConversionStrategy;
  currentAge: number;
  endAge: number;
  birthYear: number;
  filingStatus: FilingStatus;
  assumedReturnRate: number;
  stateTaxRate: number;
  annualOtherIncome?: number;
  wageIncome?: number;
  retirementAge?: number;
  ssPia?: number;
  ssClaimAge?: number;
  taxYear?: number;
}

export function simulateConversionStrategy(input: ConversionSimulationInput): YearResult[] {
  let traditionalBalance = sumAccounts(input.accounts, ['traditional_401k', 'traditional_ira']);
  let rothBalance = sumAccounts(input.accounts, ['roth_401k', 'roth_ira']);
  let brokerageBalance = sumAccounts(input.accounts, ['brokerage']);
  const results: YearResult[] = [];
  const rmdStartAge = getRmdStartAge(input.birthYear);

  for (let age = input.currentAge; age <= input.endAge; age++) {
    const isRetired = input.retirementAge ? age >= input.retirementAge : true;
    const currentWage = isRetired ? 0 : (input.wageIncome ?? 0);
    const divisor = UNIFORM_LIFETIME_DIVISORS[age] ?? UNIFORM_LIFETIME_DIVISORS[120];
    const rmd = age >= rmdStartAge ? Math.min(traditionalBalance, roundCurrency(traditionalBalance / divisor)) : 0;
    const ssIncome = (input.ssPia && input.ssClaimAge && age >= input.ssClaimAge) ? input.ssPia * 12 : 0;
    const taxableSsIncome = roundCurrency(ssIncome * 0.85);
    const baseTaxableIncome = currentWage + (input.annualOtherIncome ?? 0) + taxableSsIncome + rmd;
    
    // Only convert if retired (since in working years wages likely fill low brackets)
    const conversion = isRetired ? Math.min(traditionalBalance - rmd, conversionAmount(input.strategy, baseTaxableIncome, input.filingStatus, input.taxYear ?? 2026, age, rmdStartAge)) : 0;
    const taxableIncome = baseTaxableIncome + conversion;
    const taxYear = input.taxYear ?? 2026;
    const table = getTaxTable(taxYear, input.filingStatus);
    const stateTaxableIncome = Math.max(0, taxableIncome - table.standardDeduction);
    const federalTax = isRetired ? calculateTax(taxableIncome, input.filingStatus, taxYear) : 0;
    const stateTax = isRetired ? roundCurrency(stateTaxableIncome * input.stateTaxRate) : 0;
    const totalTax = roundCurrency(federalTax + stateTax);
    const marginalRate = getMarginalBracket(taxableIncome, input.filingStatus, taxYear).rate;

    traditionalBalance = Math.max(0, traditionalBalance - rmd - conversion);
    brokerageBalance += rmd;

    let actualRothDeposit = conversion;
    if (brokerageBalance >= totalTax) {
      brokerageBalance = roundCurrency(brokerageBalance - totalTax);
    } else {
      const unpaidTax = roundCurrency(totalTax - brokerageBalance);
      brokerageBalance = 0;
      actualRothDeposit = Math.max(0, conversion - unpaidTax);
    }
    rothBalance += actualRothDeposit;

    traditionalBalance = roundCurrency(traditionalBalance * (1 + input.assumedReturnRate));
    rothBalance = roundCurrency(rothBalance * (1 + input.assumedReturnRate));
    brokerageBalance = roundCurrency(brokerageBalance * (1 + input.assumedReturnRate));

    results.push({
      age,
      traditionalBalance,
      rothBalance,
      brokerageBalance,
      rmd,
      conversion: roundCurrency(conversion),
      taxableIncome: roundCurrency(taxableIncome),
      federalTax,
      stateTax,
      totalTax,
      marginalRate,
      endingAssets: roundCurrency(traditionalBalance + rothBalance + brokerageBalance),
    });
  }

  return results;
}

function conversionAmount(strategy: RothConversionStrategy, taxableIncome: number, filingStatus: FilingStatus, taxYear: number, age: number, rmdStartAge: number): number {
  if (strategy.mode === 'none') {
    return 0;
  }
  if (strategy.mode === 'fixed-amount') {
    if (strategy.stopAtRmdAge && age >= rmdStartAge) return 0;
    return Math.max(0, strategy.amount);
  }
  if (strategy.mode === 'fill-to-income') {
    if (strategy.stopAtRmdAge && age >= rmdStartAge) return 0;
    return Math.max(0, strategy.targetIncome - taxableIncome);
  }
  if (strategy.mode === 'auto-optimize' || strategy.mode === 'smooth-income-target') {
    return 0; // handled by scenario engine
  }
  return amountToFillBracket(taxableIncome, ceilingForRate(strategy.targetBracket, filingStatus, taxYear), filingStatus, taxYear);
}

function sumAccounts(accounts: AccountSnapshot[], types: AccountSnapshot['type'][]): number {
  const latestByType = new Map<AccountSnapshot['type'], AccountSnapshot>();
  for (const account of accounts) {
    if (!types.includes(account.type)) continue;
    const existing = latestByType.get(account.type);
    if (!existing || new Date(account.snapshotDate) > new Date(existing.snapshotDate)) {
      latestByType.set(account.type, account);
    }
  }
  return Array.from(latestByType.values()).reduce((total, account) => total + account.balance, 0);
}
