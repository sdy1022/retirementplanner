import { AccountSnapshot, FilingStatus, RothConversionStrategy, SpendingOrder, YearResult } from '../models/retirement.models';
import { getRmdStartAge, UNIFORM_LIFETIME_DIVISORS } from './rmd-calculator';
import { amountToFillBracket, calculateTax, ceilingForRate, getMarginalBracket, roundCurrency } from './tax-bracket-calculator';
import { BRACKET_INFLATION_RATE, getTaxTable, irmaaAnnualSurcharge } from './tax-tables';

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
  allowPreRetirementConversions?: boolean;
  annualWageGrowth?: number;
  spendingOrder?: SpendingOrder;
}

// Only the gain portion of brokerage withdrawals is taxed, at the long-term capital gains rate
const LONG_TERM_CAPITAL_GAINS_RATE = 0.15;

// Living expenses grow with inflation each year after retirement
const EXPENSE_INFLATION_RATE = 0.03;

// Traditional withdrawals up to the top of this bracket are cheap; harvest that space
// for living expenses before touching brokerage or Roth
const LOW_BRACKET_HARVEST_RATE = 0.12;

// Medicare premiums (and IRMAA surcharges) start at 65, based on MAGI from two years prior
const MEDICARE_AGE = 65;
const IRMAA_LOOKBACK_YEARS = 2;

export function simulateConversionStrategy(input: ConversionSimulationInput): YearResult[] {
  let traditionalBalance = sumAccounts(input.accounts, ['traditional_401k', 'traditional_ira']);
  let rothBalance = sumAccounts(input.accounts, ['roth_401k', 'roth_ira']);
  let brokerageBalance = sumAccounts(input.accounts, ['brokerage']);
  // Cost basis defaults to the full balance (no embedded gain) when not provided;
  // growth increases the balance but not the basis, so gains accrue over the simulation.
  let brokerageBasis = sumCostBasis(input.accounts, ['brokerage']);
  const results: YearResult[] = [];
  const rmdStartAge = getRmdStartAge(input.birthYear);
  const magiByAge = new Map<number, number>();

  for (let age = input.currentAge; age <= input.endAge; age++) {
    const isRetired = input.retirementAge ? age >= input.retirementAge : true;
    // Wages grow by a flat dollar raise each working year
    const currentWage = isRetired ? 0 : Math.max(0, (input.wageIncome ?? 0) + (input.annualWageGrowth ?? 0) * (age - input.currentAge));
    const divisor = UNIFORM_LIFETIME_DIVISORS[age] ?? UNIFORM_LIFETIME_DIVISORS[120];
    const rmd = age >= rmdStartAge ? Math.min(traditionalBalance, roundCurrency(traditionalBalance / divisor)) : 0;
    const ssIncome = (input.ssPia && input.ssClaimAge && age >= input.ssClaimAge) ? input.ssPia * 12 : 0;
    const taxableSsIncome = roundCurrency(ssIncome * 0.85);
    const taxYear = input.taxYear ?? 2026;
    // Index brackets and standard deduction to the simulated year so frozen base-year
    // brackets don't create artificial bracket creep against inflating balances/expenses
    const inflationFactor = Math.pow(1 + BRACKET_INFLATION_RATE, age - input.currentAge);
    const table = getTaxTable(taxYear, input.filingStatus, inflationFactor);

    // Living expenses are covered by SS and RMD cash first, then traditional withdrawals up to the
    // top of the 12% bracket (harvesting the cheap space), then brokerage, then more traditional,
    // then Roth. All traditional slices are ordinary income, so they join the tax base before the
    // conversion decision and consume bracket room that would otherwise go to conversions.
    const expenseBaseAge = input.retirementAge ?? input.currentAge;
    const livingExpenses = isRetired
      ? roundCurrency((input.annualLivingExpenses ?? 0) * Math.pow(1 + EXPENSE_INFLATION_RATE, age - expenseBaseAge))
      : 0;
    // RMD cash pays expenses first (after SS); only the unspent remainder is deposited to brokerage
    const rmdSpentOnExpenses = Math.min(rmd, Math.max(0, livingExpenses - ssIncome));
    const spendingNeed = Math.max(0, livingExpenses - ssIncome - rmd);

    const baseIncomeBeforeWithdrawals = currentWage + (input.annualOtherIncome ?? 0) + taxableSsIncome + rmd;
    const lowBracketGrossCeiling = ceilingForRate(LOW_BRACKET_HARVEST_RATE, input.filingStatus, taxYear, inflationFactor) + table.standardDeduction;
    const lowBracketRoom = Math.max(0, lowBracketGrossCeiling - baseIncomeBeforeWithdrawals);
    // 'brokerage-first' skips the low-bracket harvest so conversions get the bracket room instead
    const fromTraditionalLow = input.spendingOrder === 'brokerage-first'
      ? 0
      : Math.min(Math.max(0, traditionalBalance - rmd), spendingNeed, lowBracketRoom);
    const fromBrokerage = Math.min(brokerageBalance, spendingNeed - fromTraditionalLow);
    const fromTraditionalHigh = Math.min(Math.max(0, traditionalBalance - rmd - fromTraditionalLow), spendingNeed - fromTraditionalLow - fromBrokerage);
    const fromTraditional = fromTraditionalLow + fromTraditionalHigh;

    const baseTaxableIncome = baseIncomeBeforeWithdrawals + fromTraditional;

    // By default only convert once retired (wages likely fill the low brackets); with
    // allowPreRetirementConversions, working years use whatever room remains above wages.
    // A preserve floor keeps part of the traditional balance unconverted so later years
    // can drain it through the low brackets instead of paying conversion-rate tax now.
    const canConvert = isRetired || (input.allowPreRetirementConversions ?? false);
    const preserveFloor = input.strategy.mode === 'fill-to-income' ? (input.strategy.preserveFloor ?? 0) : 0;
    const conversionCap = Math.max(0, traditionalBalance - rmd - fromTraditional - preserveFloor);
    const conversion = canConvert ? Math.min(conversionCap, conversionAmount(input.strategy, baseTaxableIncome, input.filingStatus, taxYear, age, rmdStartAge, inflationFactor)) : 0;
    const taxableIncome = baseTaxableIncome + conversion;
    const stateTaxableIncome = Math.max(0, taxableIncome - table.standardDeduction);
    const brokerageGainFraction = brokerageBalance > 0 ? Math.max(0, brokerageBalance - brokerageBasis) / brokerageBalance : 0;
    const realizedGain = roundCurrency(fromBrokerage * brokerageGainFraction);
    const capitalGainsFederalTax = roundCurrency(realizedGain * LONG_TERM_CAPITAL_GAINS_RATE);
    const capitalGainsStateTax = roundCurrency(realizedGain * input.stateTaxRate);
    // Working years: wages cover their own taxes, so the plan is charged only the
    // incremental tax the conversion adds on top of wage income.
    const federalTax = isRetired
      ? roundCurrency(calculateTax(taxableIncome, input.filingStatus, taxYear, inflationFactor) + capitalGainsFederalTax)
      : conversion > 0
        ? roundCurrency(calculateTax(taxableIncome, input.filingStatus, taxYear, inflationFactor) - calculateTax(baseTaxableIncome, input.filingStatus, taxYear, inflationFactor))
        : 0;
    const baseStateTaxableIncome = Math.max(0, baseTaxableIncome - table.standardDeduction);
    const stateTax = isRetired
      ? roundCurrency(stateTaxableIncome * input.stateTaxRate + capitalGainsStateTax)
      : conversion > 0
        ? roundCurrency((stateTaxableIncome - baseStateTaxableIncome) * input.stateTaxRate)
        : 0;
    const totalTax = roundCurrency(federalTax + stateTax);
    const marginalRate = getMarginalBracket(taxableIncome, input.filingStatus, taxYear, inflationFactor).rate;

    // IRMAA: Medicare surcharge from 65 on, cliff-based on MAGI from two years prior.
    // MAGI proxy = gross ordinary income + realized capital gains.
    const magi = roundCurrency(taxableIncome + realizedGain);
    magiByAge.set(age, magi);
    const lookbackMagi = magiByAge.get(age - IRMAA_LOOKBACK_YEARS) ?? magi;
    const irmaa = age >= MEDICARE_AGE ? irmaaAnnualSurcharge(lookbackMagi, input.filingStatus) : 0;

    traditionalBalance = Math.max(0, traditionalBalance - rmd - fromTraditional - conversion);
    brokerageBalance = roundCurrency(brokerageBalance + rmd - rmdSpentOnExpenses - fromBrokerage);
    // Withdrawals consume basis pro rata; unspent RMD cash deposits carry full basis
    brokerageBasis = roundCurrency(Math.max(0, brokerageBasis - fromBrokerage * (1 - brokerageGainFraction)) + rmd - rmdSpentOnExpenses);

    const totalOutflow = roundCurrency(totalTax + irmaa);
    let actualRothDeposit = conversion;
    let unpaidOutflow = 0;
    if (brokerageBalance >= totalOutflow) {
      brokerageBalance = roundCurrency(brokerageBalance - totalOutflow);
    } else {
      const unpaidTax = roundCurrency(totalOutflow - brokerageBalance);
      brokerageBalance = 0;
      actualRothDeposit = Math.max(0, conversion - unpaidTax);
      // Whatever the conversion withholding couldn't cover has no funding source
      unpaidOutflow = roundCurrency(Math.max(0, unpaidTax - conversion));
    }
    rothBalance += actualRothDeposit;
    // Tax payments draw down basis first (untaxed); keep basis within the remaining balance
    brokerageBasis = Math.min(brokerageBasis, brokerageBalance);

    // Taxes still unpaid after brokerage and conversion withholding come from Roth
    // (a tax-free withdrawal), so a wealthy plan is not flagged as underfunded
    const rothForTax = Math.min(rothBalance, unpaidOutflow);
    rothBalance = roundCurrency(rothBalance - rothForTax);
    unpaidOutflow = roundCurrency(unpaidOutflow - rothForTax);

    // Last-resort Roth withdrawal if brokerage and traditional couldn't cover the spending need
    const fromRoth = Math.min(rothBalance, spendingNeed - fromBrokerage - fromTraditional);
    rothBalance = Math.max(0, rothBalance - fromRoth);

    // Expenses or taxes no account could fund — surfaced so an infeasible plan is visible
    const unfundedExpenses = Math.max(0, spendingNeed - fromBrokerage - fromTraditional - fromRoth);
    const shortfall = roundCurrency(unpaidOutflow + unfundedExpenses);

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
      irmaa,
      shortfall,
      marginalRate,
      livingExpenses,
      endingAssets: roundCurrency(traditionalBalance + rothBalance + brokerageBalance),
    });
  }

  return results;
}

function conversionAmount(strategy: RothConversionStrategy, taxableIncome: number, filingStatus: FilingStatus, taxYear: number, age: number, rmdStartAge: number, inflationFactor: number): number {
  if (strategy.mode === 'none') {
    return 0;
  }
  if (strategy.mode === 'fixed-amount') {
    if (strategy.stopAtRmdAge && age >= rmdStartAge) return 0;
    if (strategy.conversionStopAge !== undefined && age >= strategy.conversionStopAge) return 0;
    return Math.max(0, strategy.amount);
  }
  if (strategy.mode === 'fill-to-income') {
    if (strategy.stopAtRmdAge && age >= rmdStartAge) return 0;
    if (strategy.conversionStopAge !== undefined && age >= strategy.conversionStopAge) return 0;
    return Math.max(0, strategy.targetIncome - taxableIncome);
  }
  if (strategy.mode === 'auto-optimize' || strategy.mode === 'smooth-income-target') {
    return 0; // handled by scenario engine
  }
  return amountToFillBracket(taxableIncome, ceilingForRate(strategy.targetBracket, filingStatus, taxYear, inflationFactor), filingStatus, taxYear, inflationFactor);
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
