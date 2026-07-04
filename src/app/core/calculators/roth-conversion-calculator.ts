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
  annualLivingExpenses?: number;
  annualOtherIncome?: number;
  wageIncome?: number;
  retirementAge?: number;
  ssPia?: number;
  ssClaimAge?: number;
  taxYear?: number;
}

// Only the gain portion of brokerage withdrawals is taxed, at the long-term capital gains rate
const LONG_TERM_CAPITAL_GAINS_RATE = 0.15;

export function simulateConversionStrategy(input: ConversionSimulationInput): YearResult[] {
  let traditionalBalance = sumAccounts(input.accounts, ['traditional_401k', 'traditional_ira']);
  let rothBalance = sumAccounts(input.accounts, ['roth_401k', 'roth_ira']);
  let brokerageBalance = sumAccounts(input.accounts, ['brokerage']);
  // Cost basis defaults to the full balance (no embedded gain) when not provided;
  // growth increases the balance but not the basis, so gains accrue over the simulation.
  let brokerageBasis = sumCostBasis(input.accounts, ['brokerage']);
  const results: YearResult[] = [];
  const rmdStartAge = getRmdStartAge(input.birthYear);

  for (let age = input.currentAge; age <= input.endAge; age++) {
    const isRetired = input.retirementAge ? age >= input.retirementAge : true;
    const currentWage = isRetired ? 0 : (input.wageIncome ?? 0);
    const divisor = UNIFORM_LIFETIME_DIVISORS[age] ?? UNIFORM_LIFETIME_DIVISORS[120];
    const rmd = age >= rmdStartAge ? Math.min(traditionalBalance, roundCurrency(traditionalBalance / divisor)) : 0;
    const ssIncome = (input.ssPia && input.ssClaimAge && age >= input.ssClaimAge) ? input.ssPia * 12 : 0;
    const taxableSsIncome = roundCurrency(ssIncome * 0.85);

    // Living expenses are covered by SS and RMD cash first, then brokerage, then traditional, then Roth.
    // The traditional slice is ordinary income, so it joins the tax base before the conversion decision
    // and consumes bracket room that would otherwise go to conversions.
    const livingExpenses = isRetired ? (input.annualLivingExpenses ?? 0) : 0;
    const spendingNeed = Math.max(0, livingExpenses - ssIncome - rmd);
    const fromBrokerage = Math.min(brokerageBalance, spendingNeed);
    const fromTraditional = Math.min(Math.max(0, traditionalBalance - rmd), spendingNeed - fromBrokerage);

    const baseTaxableIncome = currentWage + (input.annualOtherIncome ?? 0) + taxableSsIncome + rmd + fromTraditional;

    // Only convert if retired (since in working years wages likely fill low brackets)
    const conversion = isRetired ? Math.min(traditionalBalance - rmd - fromTraditional, conversionAmount(input.strategy, baseTaxableIncome, input.filingStatus, input.taxYear ?? 2026, age, rmdStartAge)) : 0;
    const taxableIncome = baseTaxableIncome + conversion;
    const taxYear = input.taxYear ?? 2026;
    const table = getTaxTable(taxYear, input.filingStatus);
    const stateTaxableIncome = Math.max(0, taxableIncome - table.standardDeduction);
    const brokerageGainFraction = brokerageBalance > 0 ? Math.max(0, brokerageBalance - brokerageBasis) / brokerageBalance : 0;
    const realizedGain = roundCurrency(fromBrokerage * brokerageGainFraction);
    const capitalGainsFederalTax = roundCurrency(realizedGain * LONG_TERM_CAPITAL_GAINS_RATE);
    const capitalGainsStateTax = roundCurrency(realizedGain * input.stateTaxRate);
    const federalTax = isRetired ? roundCurrency(calculateTax(taxableIncome, input.filingStatus, taxYear) + capitalGainsFederalTax) : 0;
    const stateTax = isRetired ? roundCurrency(stateTaxableIncome * input.stateTaxRate + capitalGainsStateTax) : 0;
    const totalTax = roundCurrency(federalTax + stateTax);
    const marginalRate = getMarginalBracket(taxableIncome, input.filingStatus, taxYear).rate;

    traditionalBalance = Math.max(0, traditionalBalance - rmd - fromTraditional - conversion);
    brokerageBalance = roundCurrency(brokerageBalance + rmd - fromBrokerage);
    // Withdrawals consume basis pro rata; RMD cash deposits carry full basis
    brokerageBasis = roundCurrency(Math.max(0, brokerageBasis - fromBrokerage * (1 - brokerageGainFraction)) + rmd);

    let actualRothDeposit = conversion;
    if (brokerageBalance >= totalTax) {
      brokerageBalance = roundCurrency(brokerageBalance - totalTax);
    } else {
      const unpaidTax = roundCurrency(totalTax - brokerageBalance);
      brokerageBalance = 0;
      actualRothDeposit = Math.max(0, conversion - unpaidTax);
    }
    rothBalance += actualRothDeposit;
    // Tax payments draw down basis first (untaxed); keep basis within the remaining balance
    brokerageBasis = Math.min(brokerageBasis, brokerageBalance);

    // Last-resort Roth withdrawal if brokerage and traditional couldn't cover the spending need
    const fromRoth = Math.min(rothBalance, spendingNeed - fromBrokerage - fromTraditional);
    rothBalance = Math.max(0, rothBalance - fromRoth);

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

function latestAccounts(accounts: AccountSnapshot[], types: AccountSnapshot['type'][]): AccountSnapshot[] {
  const latestByType = new Map<AccountSnapshot['type'], AccountSnapshot>();
  for (const account of accounts) {
    if (!types.includes(account.type)) continue;
    const existing = latestByType.get(account.type);
    if (!existing || new Date(account.snapshotDate) > new Date(existing.snapshotDate)) {
      latestByType.set(account.type, account);
    }
  }
  return Array.from(latestByType.values());
}

function sumAccounts(accounts: AccountSnapshot[], types: AccountSnapshot['type'][]): number {
  return latestAccounts(accounts, types).reduce((total, account) => total + account.balance, 0);
}

function sumCostBasis(accounts: AccountSnapshot[], types: AccountSnapshot['type'][]): number {
  return latestAccounts(accounts, types).reduce((total, account) => total + (account.costBasis ?? account.balance), 0);
}
