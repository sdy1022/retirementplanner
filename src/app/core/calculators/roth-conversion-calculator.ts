import { AccountSnapshot, FilingStatus, RothConversionStrategy, SblocTaxFunding, SpendingOrder, YearResult } from '../models/retirement.models';
import { getRmdStartAge, UNIFORM_LIFETIME_DIVISORS } from './rmd-calculator';
import { taxableSocialSecurity } from './social-security-calculator';
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
  dividendYield?: number;
  sblocTaxFunding?: SblocTaxFunding;
}

// Loan draws stop once the SBLOC reaches this fraction of the brokerage collateral
export const DEFAULT_SBLOC_MAX_LTV = 0.4;

// Only the gain portion of brokerage withdrawals is taxed, at the long-term capital gains rate
export const LONG_TERM_CAPITAL_GAINS_RATE = 0.15;

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
  const sbloc = input.sblocTaxFunding;
  let sblocLoanBalance = 0;
  const results: YearResult[] = [];
  const rmdStartAge = getRmdStartAge(input.birthYear);
  const magiByAge = new Map<number, number>();
  // Simulate whole attained-age years: fractional input ages are floored so table lookups
  // (RMD divisors, bracket indexing) always see integer ages instead of falling through
  const startAge = Math.floor(input.currentAge);
  const lastAge = Math.floor(input.endAge);

  for (let age = startAge; age <= lastAge; age++) {
    const isRetired = input.retirementAge ? age >= input.retirementAge : true;
    // Wages grow by a flat dollar raise each working year
    const currentWage = isRetired ? 0 : Math.max(0, (input.wageIncome ?? 0) + (input.annualWageGrowth ?? 0) * (age - startAge));
    const divisor = UNIFORM_LIFETIME_DIVISORS[age] ?? UNIFORM_LIFETIME_DIVISORS[120];
    // Beginning-of-year balance (≈ prior Dec 31 after growth), matching the IRS RMD basis
    const rmd = age >= rmdStartAge ? Math.min(traditionalBalance, roundCurrency(traditionalBalance / divisor)) : 0;
    const ssIncome = (input.ssPia && input.ssClaimAge && age >= input.ssClaimAge) ? input.ssPia * 12 : 0;
    // Sizing pass assumes the 85% cap (true whenever conversions/RMDs fill the brackets);
    // the exact provisional-income amount is computed once withdrawals are known
    const taxableSsEstimate = roundCurrency(ssIncome * 0.85);
    const taxYear = input.taxYear ?? 2026;
    // Index brackets and standard deduction to the simulated year so frozen base-year
    // brackets don't create artificial bracket creep against inflating balances/expenses
    const inflationFactor = Math.pow(1 + BRACKET_INFLATION_RATE, age - startAge);
    const table = getTaxTable(taxYear, input.filingStatus, inflationFactor);

    // Living expenses are covered by SS and RMD cash first, then traditional withdrawals up to the
    // top of the 12% bracket (harvesting the cheap space), then brokerage, then more traditional,
    // then Roth. All traditional slices are ordinary income, so they join the tax base before the
    // conversion decision and consume bracket room that would otherwise go to conversions.
    const expenseBaseAge = Math.floor(input.retirementAge ?? input.currentAge);
    const livingExpenses = isRetired
      ? roundCurrency((input.annualLivingExpenses ?? 0) * Math.pow(1 + EXPENSE_INFLATION_RATE, age - expenseBaseAge))
      : 0;
    // RMD cash pays expenses first (after SS); only the unspent remainder is deposited to brokerage
    const rmdSpentOnExpenses = Math.min(rmd, Math.max(0, livingExpenses - ssIncome));
    const spendingNeed = Math.max(0, livingExpenses - ssIncome - rmd);

    const baseIncomeBeforeWithdrawals = currentWage + (input.annualOtherIncome ?? 0) + taxableSsEstimate + rmd;
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
    // Exact Social Security taxability via the provisional-income formula, now that all
    // non-SS ordinary income is known (below the 85% sizing estimate in low-income years)
    const nonSsOrdinaryIncome = currentWage + (input.annualOtherIncome ?? 0) + rmd + fromTraditional + conversion;
    let taxableSsIncome = roundCurrency(taxableSocialSecurity(ssIncome, nonSsOrdinaryIncome, input.filingStatus));
    let taxableIncome = roundCurrency(nonSsOrdinaryIncome + taxableSsIncome);
    // State (e.g. Indiana): flat rate on ordinary income, Social Security exempt,
    // no federal-style standard deduction
    const stateTaxableIncome = Math.max(0, nonSsOrdinaryIncome);
    const brokerageGainFraction = brokerageBalance > 0 ? Math.max(0, brokerageBalance - brokerageBasis) / brokerageBalance : 0;
    const realizedGain = roundCurrency(fromBrokerage * brokerageGainFraction);
    const capitalGainsFederalTax = roundCurrency(realizedGain * LONG_TERM_CAPITAL_GAINS_RATE);
    const capitalGainsStateTax = roundCurrency(realizedGain * input.stateTaxRate);
    // Dividends are a slice of the total return that gets taxed annually even when
    // reinvested; the reinvestment raises cost basis after the year's growth is applied
    const dividends = roundCurrency(brokerageBalance * (input.dividendYield ?? 0));
    const dividendFederalTax = roundCurrency(dividends * LONG_TERM_CAPITAL_GAINS_RATE);
    const dividendStateTax = roundCurrency(dividends * input.stateTaxRate);
    // Working years: wages cover their own taxes, so the plan is charged only the
    // incremental tax the conversion adds on top of wage income.
    let federalTax = isRetired
      ? roundCurrency(calculateTax(taxableIncome, input.filingStatus, taxYear, inflationFactor) + capitalGainsFederalTax + dividendFederalTax)
      : roundCurrency((conversion > 0
          ? calculateTax(taxableIncome, input.filingStatus, taxYear, inflationFactor) - calculateTax(taxableIncome - conversion, input.filingStatus, taxYear, inflationFactor)
          : 0) + dividendFederalTax);
    let stateTax = isRetired
      ? roundCurrency(stateTaxableIncome * input.stateTaxRate + capitalGainsStateTax + dividendStateTax)
      : roundCurrency((conversion > 0 ? conversion * input.stateTaxRate : 0) + dividendStateTax);
    let totalTax = roundCurrency(federalTax + stateTax);
    let marginalRate = getMarginalBracket(taxableIncome, input.filingStatus, taxYear, inflationFactor).rate;

    // IRMAA: Medicare surcharge from 65 on, cliff-based on MAGI from two years prior.
    // MAGI proxy = gross ordinary income + realized capital gains + dividends.
    let magi = roundCurrency(taxableIncome + realizedGain + dividends);
    magiByAge.set(age, magi);
    const lookbackMagi = magiByAge.get(age - IRMAA_LOOKBACK_YEARS) ?? magi;
    const irmaa = age >= MEDICARE_AGE ? irmaaAnnualSurcharge(lookbackMagi, input.filingStatus) : 0;

    traditionalBalance = Math.max(0, traditionalBalance - rmd - fromTraditional - conversion);
    brokerageBalance = roundCurrency(brokerageBalance + rmd - rmdSpentOnExpenses - fromBrokerage);
    // Withdrawals consume basis pro rata; unspent RMD cash deposits carry full basis
    brokerageBasis = roundCurrency(Math.max(0, brokerageBasis - fromBrokerage * (1 - brokerageGainFraction)) + rmd - rmdSpentOnExpenses);

    // SBLOC (Buy-Borrow-Die) tax funding: interest compounds on the outstanding loan every
    // year (never repaid — the estate settles it at death). Inside the window, the
    // conversion's incremental tax is drawn on the line instead of selling brokerage,
    // capped so the loan never exceeds maxLtv of the collateral.
    const sblocInterest = sbloc ? roundCurrency(sblocLoanBalance * sbloc.borrowRate) : 0;
    sblocLoanBalance = roundCurrency(sblocLoanBalance + sblocInterest);
    let sblocDraw = 0;
    if (sbloc && age >= sbloc.startAge && age <= sbloc.endAge && conversion > 0) {
      const conversionTax = roundCurrency(
        calculateTax(taxableIncome, input.filingStatus, taxYear, inflationFactor)
        - calculateTax(taxableIncome - conversion, input.filingStatus, taxYear, inflationFactor)
        + conversion * input.stateTaxRate,
      );
      const ltvRoom = Math.max(0, (sbloc.maxLtv ?? DEFAULT_SBLOC_MAX_LTV) * brokerageBalance - sblocLoanBalance);
      sblocDraw = roundCurrency(Math.min(conversionTax, totalTax + irmaa, ltvRoom));
      sblocLoanBalance = roundCurrency(sblocLoanBalance + sblocDraw);
    }

    const totalOutflow = roundCurrency(totalTax + irmaa - sblocDraw);
    let taxFromBrokerage = totalOutflow;
    let actualRothDeposit = conversion;
    let unpaidOutflow = 0;
    if (brokerageBalance >= totalOutflow) {
      brokerageBalance = roundCurrency(brokerageBalance - totalOutflow);
    } else {
      taxFromBrokerage = brokerageBalance;
      const unpaidTax = roundCurrency(totalOutflow - brokerageBalance);
      brokerageBalance = 0;
      if (age >= 59.5) {
        actualRothDeposit = Math.max(0, conversion - unpaidTax);
        // Whatever the conversion withholding couldn't cover has no funding source
        unpaidOutflow = roundCurrency(Math.max(0, unpaidTax - conversion));
      } else {
        // Before 59½, tax withheld from a conversion is itself an early distribution
        // (penalty risk), so keep the conversion intact and let Roth/shortfall absorb it
        unpaidOutflow = unpaidTax;
      }
    }
    rothBalance += actualRothDeposit;
    // Tax payments draw down basis first (untaxed); keep basis within the remaining balance
    brokerageBasis = Math.min(brokerageBasis, brokerageBalance);

    // Taxes still unpaid after brokerage and conversion withholding are funded from the
    // remaining traditional balance before Roth is touched — draining pre-tax dollars at
    // today's marginal rate beats spending tax-free Roth to preserve them. The withdrawal
    // is itself ordinary income, so it is grossed up for the extra tax it creates (solved
    // by fixed-point iteration), even when that spills into a higher bracket.
    let taxFromTraditional = 0;
    if (unpaidOutflow > 0 && traditionalBalance > 0) {
      const baseFederalTax = calculateTax(taxableIncome, input.filingStatus, taxYear, inflationFactor);
      const grossUpTax = (extra: number): number => {
        const ssTaxable = roundCurrency(taxableSocialSecurity(ssIncome, nonSsOrdinaryIncome + extra, input.filingStatus));
        const fedDelta = calculateTax(roundCurrency(nonSsOrdinaryIncome + extra + ssTaxable), input.filingStatus, taxYear, inflationFactor) - baseFederalTax;
        return roundCurrency(fedDelta + extra * input.stateTaxRate);
      };
      let withdrawal = Math.min(traditionalBalance, unpaidOutflow);
      for (let i = 0; i < 30; i++) {
        const next = Math.min(traditionalBalance, roundCurrency(unpaidOutflow + grossUpTax(withdrawal)));
        if (Math.abs(next - withdrawal) < 0.01) {
          withdrawal = next;
          break;
        }
        withdrawal = next;
      }
      const extraTax = grossUpTax(withdrawal);
      taxFromTraditional = withdrawal;
      traditionalBalance = roundCurrency(traditionalBalance - withdrawal);
      unpaidOutflow = roundCurrency(Math.max(0, unpaidOutflow + extraTax - withdrawal));
      // Fold the gross-up income into the year's reported income, tax, and MAGI figures
      taxableSsIncome = roundCurrency(taxableSocialSecurity(ssIncome, nonSsOrdinaryIncome + withdrawal, input.filingStatus));
      taxableIncome = roundCurrency(nonSsOrdinaryIncome + withdrawal + taxableSsIncome);
      stateTax = roundCurrency(stateTax + withdrawal * input.stateTaxRate);
      federalTax = roundCurrency(federalTax + extraTax - withdrawal * input.stateTaxRate);
      totalTax = roundCurrency(federalTax + stateTax);
      marginalRate = getMarginalBracket(taxableIncome, input.filingStatus, taxYear, inflationFactor).rate;
      magi = roundCurrency(taxableIncome + realizedGain + dividends);
      magiByAge.set(age, magi);
    }

    // Taxes still unpaid after brokerage, withholding, and traditional come from Roth
    // (a tax-free withdrawal), so a wealthy plan is not flagged as underfunded
    const rothForTax = Math.min(rothBalance, unpaidOutflow);
    rothBalance = roundCurrency(rothBalance - rothForTax);
    unpaidOutflow = roundCurrency(unpaidOutflow - rothForTax);

    // Last-resort Roth withdrawal if brokerage and traditional couldn't cover the spending need
    const fromRoth = Math.min(rothBalance, spendingNeed - fromBrokerage - fromTraditional);
    rothBalance = Math.max(0, rothBalance - fromRoth);

    // Margin-call cure: draws respect the LTV cap, but spending can shrink the collateral
    // afterward while the loan compounds. The lender forces a paydown — from brokerage first
    // (selling collateral shrinks the denominator too, hence the 1 − maxLtv factor), then
    // Roth as backstop — and the strategy continues with whatever loan is still supported.
    // Like tax payments, cure sales draw down basis first.
    let sblocPaydown = 0;
    if (sbloc && sblocLoanBalance > 0) {
      const maxLtvCap = sbloc.maxLtv ?? DEFAULT_SBLOC_MAX_LTV;
      const breach = sblocLoanBalance - maxLtvCap * brokerageBalance;
      if (breach > 0) {
        const cureFromBrokerage = roundCurrency(Math.min(brokerageBalance, breach / (1 - maxLtvCap)));
        brokerageBalance = roundCurrency(brokerageBalance - cureFromBrokerage);
        brokerageBasis = Math.min(brokerageBasis, brokerageBalance);
        const stillOwed = roundCurrency(sblocLoanBalance - cureFromBrokerage - maxLtvCap * brokerageBalance);
        const cureFromRoth = roundCurrency(Math.min(rothBalance, Math.max(0, stillOwed)));
        rothBalance = roundCurrency(rothBalance - cureFromRoth);
        sblocPaydown = roundCurrency(cureFromBrokerage + cureFromRoth);
        sblocLoanBalance = roundCurrency(Math.max(0, sblocLoanBalance - sblocPaydown));
      }
    }

    // Expenses or taxes no account could fund — surfaced so an infeasible plan is visible
    const unfundedExpenses = Math.max(0, spendingNeed - fromBrokerage - fromTraditional - fromRoth);
    const shortfall = roundCurrency(unpaidOutflow + unfundedExpenses);

    traditionalBalance = roundCurrency(traditionalBalance * (1 + input.assumedReturnRate));
    rothBalance = roundCurrency(rothBalance * (1 + input.assumedReturnRate));
    brokerageBalance = roundCurrency(brokerageBalance * (1 + input.assumedReturnRate));
    // Reinvested dividends were taxed this year, so they add to basis (never taxed again)
    brokerageBasis = Math.min(roundCurrency(brokerageBasis + dividends), brokerageBalance);

    results.push({
      age,
      traditionalBalance,
      rothBalance,
      brokerageBalance,
      brokerageBasis: roundCurrency(brokerageBasis),
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
      expensesFromSs: roundCurrency(Math.min(ssIncome, livingExpenses)),
      expensesFromRmd: roundCurrency(rmdSpentOnExpenses),
      expensesFromTraditional: roundCurrency(fromTraditional),
      expensesFromBrokerage: roundCurrency(fromBrokerage),
      expensesFromRoth: roundCurrency(fromRoth),
      taxFromBrokerage: roundCurrency(taxFromBrokerage),
      taxWithheldFromConversion: roundCurrency(Math.max(0, conversion - actualRothDeposit)),
      taxFromTraditional: roundCurrency(taxFromTraditional),
      taxFromRoth: roundCurrency(rothForTax),
      taxFromSbloc: sblocDraw,
      sblocInterest,
      sblocLoanBalance,
      sblocPaydown,
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

export function sumAccounts(accounts: AccountSnapshot[], types: AccountSnapshot['type'][]): number {
  return latestAccounts(accounts, types).reduce((total, account) => total + account.balance, 0);
}

export function sumCostBasis(accounts: AccountSnapshot[], types: AccountSnapshot['type'][]): number {
  return latestAccounts(accounts, types).reduce((total, account) => total + (account.costBasis ?? account.balance), 0);
}
