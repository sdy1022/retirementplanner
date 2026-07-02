import { AccountSnapshot, FilingStatus, RothConversionStrategy, YearResult } from '../models/retirement.models';
import { getRmdStartAge, UNIFORM_LIFETIME_DIVISORS } from './rmd-calculator';
import { amountToFillBracket, calculateTax, ceilingForRate, roundCurrency } from './tax-bracket-calculator';

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
    const divisor = UNIFORM_LIFETIME_DIVISORS[age] ?? UNIFORM_LIFETIME_DIVISORS[120];
    const rmd = age >= rmdStartAge ? Math.min(traditionalBalance, roundCurrency(traditionalBalance / divisor)) : 0;
    const ssIncome = (input.ssPia && input.ssClaimAge && age >= input.ssClaimAge) ? input.ssPia * 12 : 0;
    const baseTaxableIncome = (input.annualOtherIncome ?? 0) + ssIncome + rmd;
    const conversion = Math.min(traditionalBalance - rmd, conversionAmount(input.strategy, baseTaxableIncome, input.filingStatus, input.taxYear ?? 2026));
    const taxableIncome = baseTaxableIncome + conversion;
    const federalTax = calculateTax(taxableIncome, input.filingStatus, input.taxYear ?? 2026);
    const stateTax = roundCurrency(Math.max(0, taxableIncome) * input.stateTaxRate);

    traditionalBalance = Math.max(0, traditionalBalance - rmd - conversion);
    rothBalance += conversion;

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
      totalTax: roundCurrency(federalTax + stateTax),
      endingAssets: roundCurrency(traditionalBalance + rothBalance + brokerageBalance),
    });
  }

  return results;
}

function conversionAmount(strategy: RothConversionStrategy, taxableIncome: number, filingStatus: FilingStatus, taxYear: number): number {
  if (strategy.mode === 'none') {
    return 0;
  }
  if (strategy.mode === 'fixed-amount') {
    return Math.max(0, strategy.amount);
  }
  return amountToFillBracket(taxableIncome, ceilingForRate(strategy.targetBracket, filingStatus, taxYear), filingStatus, taxYear);
}

function sumAccounts(accounts: AccountSnapshot[], types: AccountSnapshot['type'][]): number {
  return accounts.filter((account) => types.includes(account.type)).reduce((total, account) => total + account.balance, 0);
}
