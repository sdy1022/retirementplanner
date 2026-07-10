import { AccountSnapshot, FilingStatus, RothConversionStrategy, SblocTaxFunding, SpendingOrder, YearResult } from '../models/retirement.models';
import { getRmdStartAge, UNIFORM_LIFETIME_DIVISORS } from './rmd-calculator';
import { taxableSocialSecurity } from './social-security-calculator';
import { amountToFillBracket, calculateTax, ceilingForRate, getMarginalBracket, roundCurrency } from './tax-bracket-calculator';
import { BRACKET_INFLATION_RATE, capitalGainsFederalTax, getTaxTable, irmaaAnnualSurcharge, netInvestmentIncomeTax, seniorDeduction } from './tax-tables';

export interface ConversionSimulationInput {
  accounts: AccountSnapshot[];
  strategy: RothConversionStrategy;
  currentAge: number;
  endAge: number;
  birthYear: number;
  filingStatus: FilingStatus;
  assumedReturnRate: number;
  // Optional per-year override for Monte Carlo runs: returns the growth rate to apply for a
  // given simulated age/year-index instead of the flat assumedReturnRate. When absent, every
  // year grows at assumedReturnRate (the existing deterministic behavior).
  returnRateForYear?: (age: number, yearIndex: number) => number;
  stateTaxRate: number;
  annualLivingExpenses?: number;
  annualOtherIncome?: number;
  wageIncome?: number;
  retirementAge?: number;
  // Monthly benefit at the chosen claim age (already claiming-age-adjusted by the user)
  ssPia?: number;
  ssClaimAge?: number;
  // Annual Social Security COLA, compounded from the simulation's first year.
  // Defaults to DEFAULT_SS_COLA_RATE; pass 0 to model a frozen benefit.
  ssColaRate?: number;
  // MAGI from two years before the simulation starts, used for the IRMAA lookback in the
  // first two Medicare years when the simulation has no history of its own. Without it,
  // those years fall back to current-year MAGI (which counts this year's conversions).
  preSimulationMagi?: number;
  // Spouse modeling (MFJ only): when spouseCurrentAge and spouseLifeExpectancy are both
  // set, the year after the spouse dies the plan transitions to single filing status
  // (single brackets/deductions, single IRMAA thresholds, one Medicare enrollee) — the
  // "widow's tax penalty" — and the survivor keeps the LARGER of the two Social Security
  // benefits. All balances are assumed jointly owned and roll to the survivor.
  spouseCurrentAge?: number;
  spouseLifeExpectancy?: number;
  // Spouse monthly benefit at the spouse's claim age (already claiming-age-adjusted)
  spouseSsPia?: number;
  spouseSsClaimAge?: number;
  taxYear?: number;
  allowPreRetirementConversions?: boolean;
  annualWageGrowth?: number;
  spendingOrder?: SpendingOrder;
  dividendYield?: number;
  sblocTaxFunding?: SblocTaxFunding;
  // Optional dynamic-spending guardrail, called at the start of each year with the assets
  // carried into that year. Lets a simulation model a retiree who trims discretionary
  // spending and pauses discretionary conversions when running behind a reference plan,
  // instead of blindly executing a fixed plan through every market regime. Absent means the
  // existing behavior: full living expenses, conversions never paused by this mechanism.
  guardrail?: (params: { age: number; beginningAssets: number }) => { livingExpenseMultiplier: number; pauseConversion: boolean };
}

// Loan draws stop once the SBLOC reaches this fraction of the brokerage collateral
export const DEFAULT_SBLOC_MAX_LTV = 0.4;

// Only the gain portion of brokerage withdrawals is taxed, at the long-term capital gains rate
export const LONG_TERM_CAPITAL_GAINS_RATE = 0.15;

// Living expenses grow with inflation each year after retirement
const EXPENSE_INFLATION_RATE = 0.03;

// Long-run average Social Security COLA. Benefits are COLA-indexed every year (both before
// and after claiming), so a benefit quoted in today's dollars grows at this rate from the
// simulation's first year unless the scenario overrides it.
export const DEFAULT_SS_COLA_RATE = 0.025;

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
    // Assets carried into this year, before this year's flows/growth — what the guardrail
    // judges "behind schedule" against
    const beginningAssets = traditionalBalance + rothBalance + brokerageBalance;
    const guardrailDecision = input.guardrail?.({ age, beginningAssets }) ?? { livingExpenseMultiplier: 1, pauseConversion: false };
    // Wages grow by a flat dollar raise each working year
    const currentWage = isRetired ? 0 : Math.max(0, (input.wageIncome ?? 0) + (input.annualWageGrowth ?? 0) * (age - startAge));
    const divisor = UNIFORM_LIFETIME_DIVISORS[age] ?? UNIFORM_LIFETIME_DIVISORS[120];
    // Beginning-of-year balance (≈ prior Dec 31 after growth), matching the IRS RMD basis
    const rmd = age >= rmdStartAge ? Math.min(traditionalBalance, roundCurrency(traditionalBalance / divisor)) : 0;
    // Spouse survivorship: the spouse is alive through the year they reach their life
    // expectancy (final joint return), and the plan files single from the next year on.
    const spouseModeled = input.filingStatus === 'married_filing_jointly'
      && input.spouseCurrentAge !== undefined && input.spouseLifeExpectancy !== undefined;
    const spouseAgeNow = spouseModeled ? input.spouseCurrentAge! + (age - startAge) : undefined;
    const spouseAlive = !spouseModeled || spouseAgeNow! <= input.spouseLifeExpectancy!;
    const filingStatus: FilingStatus = spouseModeled && !spouseAlive ? 'single' : input.filingStatus;

    // Benefits as entered (already adjusted for each claim age), indexed by COLA from the
    // simulation's first year — SSA applies COLA to the record before and after claiming.
    // While both spouses are alive their benefits add; the survivor keeps the larger one.
    const ssColaFactor = Math.pow(1 + (input.ssColaRate ?? DEFAULT_SS_COLA_RATE), age - startAge);
    const primarySsStream = (input.ssPia && input.ssClaimAge && age >= input.ssClaimAge) ? roundCurrency(input.ssPia * 12 * ssColaFactor) : 0;
    const spouseSsStream = (spouseModeled && input.spouseSsPia && input.spouseSsClaimAge && spouseAgeNow! >= input.spouseSsClaimAge)
      ? roundCurrency(input.spouseSsPia * 12 * ssColaFactor)
      : 0;
    const ssIncome = spouseModeled && !spouseAlive ? Math.max(primarySsStream, spouseSsStream) : primarySsStream + spouseSsStream;
    // Sizing pass assumes the 85% cap (true whenever conversions/RMDs fill the brackets);
    // the exact provisional-income amount is computed once withdrawals are known
    const taxableSsEstimate = roundCurrency(ssIncome * 0.85);
    const taxYear = input.taxYear ?? 2026;
    // Index brackets and standard deduction to the simulated year so frozen base-year
    // brackets don't create artificial bracket creep against inflating balances/expenses
    const inflationFactor = Math.pow(1 + BRACKET_INFLATION_RATE, age - startAge);
    const table = getTaxTable(taxYear, filingStatus, inflationFactor);

    // Living expenses are covered by SS and RMD cash first, then traditional withdrawals up to the
    // top of the 12% bracket (harvesting the cheap space), then brokerage, then more traditional,
    // then Roth. All traditional slices are ordinary income, so they join the tax base before the
    // conversion decision and consume bracket room that would otherwise go to conversions.
    const expenseBaseAge = Math.floor(input.retirementAge ?? input.currentAge);
    const livingExpenses = isRetired
      ? roundCurrency((input.annualLivingExpenses ?? 0) * Math.pow(1 + EXPENSE_INFLATION_RATE, age - expenseBaseAge) * guardrailDecision.livingExpenseMultiplier)
      : 0;
    // RMD cash pays expenses first (after SS); only the unspent remainder is deposited to brokerage
    const rmdSpentOnExpenses = Math.min(rmd, Math.max(0, livingExpenses - ssIncome));
    const spendingNeed = Math.max(0, livingExpenses - ssIncome - rmd);

    const baseIncomeBeforeWithdrawals = currentWage + (input.annualOtherIncome ?? 0) + taxableSsEstimate + rmd;
    const lowBracketGrossCeiling = ceilingForRate(LOW_BRACKET_HARVEST_RATE, filingStatus, taxYear, inflationFactor) + table.standardDeduction;
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
    const canConvert = (isRetired || (input.allowPreRetirementConversions ?? false)) && !guardrailDecision.pauseConversion;
    const preserveFloor = input.strategy.mode === 'fill-to-income' ? (input.strategy.preserveFloor ?? 0) : 0;
    const conversionCap = Math.max(0, traditionalBalance - rmd - fromTraditional - preserveFloor);
    const conversion = canConvert ? Math.min(conversionCap, conversionAmount(input.strategy, baseTaxableIncome, filingStatus, taxYear, age, rmdStartAge, inflationFactor)) : 0;
    // Exact Social Security taxability via the provisional-income formula, now that all
    // non-SS ordinary income is known (below the 85% sizing estimate in low-income years)
    const nonSsOrdinaryIncome = currentWage + (input.annualOtherIncome ?? 0) + rmd + fromTraditional + conversion;
    let taxableSsIncome = roundCurrency(taxableSocialSecurity(ssIncome, nonSsOrdinaryIncome, filingStatus));
    let taxableIncome = roundCurrency(nonSsOrdinaryIncome + taxableSsIncome);
    // State (e.g. Indiana): flat rate on ordinary income, Social Security exempt,
    // no federal-style standard deduction
    const stateTaxableIncome = Math.max(0, nonSsOrdinaryIncome);
    const brokerageGainFraction = brokerageBalance > 0 ? Math.max(0, brokerageBalance - brokerageBasis) / brokerageBalance : 0;
    const realizedGain = roundCurrency(fromBrokerage * brokerageGainFraction);
    const capitalGainsStateTax = roundCurrency(realizedGain * input.stateTaxRate);
    // Dividends are a slice of the total return that gets taxed annually even when
    // reinvested; the reinvestment raises cost basis after the year's growth is applied.
    // All dividends are treated as qualified (taxed at capital-gains rates).
    const dividends = roundCurrency(brokerageBalance * (input.dividendYield ?? 0));
    const dividendStateTax = roundCurrency(dividends * input.stateTaxRate);
    // Senior deductions (the 65+ additional standard deduction, plus the OBBBA enhanced
    // deduction through 2028, phased out on MAGI) shrink the ordinary income fed to the
    // bracket math — equivalent to a larger standard deduction. The phaseout is solved
    // against this year's MAGI proxy; the later tax-payment gross-up raises MAGI slightly
    // but the deduction is not re-solved for that second-order effect.
    const calendarYear = taxYear + (age - startAge);
    const extraDeduction = seniorDeduction(age, filingStatus, calendarYear, roundCurrency(taxableIncome + realizedGain + dividends), inflationFactor);
    const fedOrdinaryTax = (gross: number) => calculateTax(Math.max(0, gross - extraDeduction), filingStatus, taxYear, inflationFactor);
    // Long-term gains and qualified dividends stack on top of ordinary taxable income
    // through the 0/15/20% bands (a low-income year taxes gains at 0%), plus the 3.8%
    // NIIT once MAGI crosses the unindexed statutory threshold.
    const ordinaryTaxableAfterDeductions = Math.max(0, taxableIncome - extraDeduction - table.standardDeduction);
    const investmentGains = roundCurrency(realizedGain + dividends);
    const magiProxy = roundCurrency(taxableIncome + realizedGain + dividends);
    const investmentFederalTax = roundCurrency(
      capitalGainsFederalTax(investmentGains, ordinaryTaxableAfterDeductions, filingStatus, inflationFactor)
      + netInvestmentIncomeTax(investmentGains, magiProxy, filingStatus),
    );
    // Traditional withdrawals before 59½ owe the 10% early-distribution penalty (Roth
    // conversions themselves are exempt; penalty exceptions like 72(t)/rule-of-55 are not
    // modeled). Roth earnings withdrawals would also owe it, but Roth basis isn't tracked.
    const expensePenalty = age < 59.5 ? roundCurrency(0.1 * fromTraditional) : 0;
    // Working years: wages cover their own taxes, so the plan is charged only the
    // incremental tax the conversion adds on top of wage income.
    let federalTax = isRetired
      ? roundCurrency(fedOrdinaryTax(taxableIncome) + investmentFederalTax + expensePenalty)
      : roundCurrency((conversion > 0
          ? fedOrdinaryTax(taxableIncome) - fedOrdinaryTax(taxableIncome - conversion)
          : 0) + investmentFederalTax + expensePenalty);
    let stateTax = isRetired
      ? roundCurrency(stateTaxableIncome * input.stateTaxRate + capitalGainsStateTax + dividendStateTax)
      : roundCurrency((conversion > 0 ? conversion * input.stateTaxRate : 0) + capitalGainsStateTax + dividendStateTax);
    let totalTax = roundCurrency(federalTax + stateTax);
    let marginalRate = getMarginalBracket(taxableIncome, filingStatus, taxYear, inflationFactor).rate;

    // IRMAA: Medicare surcharge from 65 on, cliff-based on MAGI from two years prior.
    // MAGI proxy = gross ordinary income + realized capital gains + dividends. For lookback
    // years before the simulation started, preSimulationMagi (the user's actual income two
    // years ago) is used when provided; otherwise current-year MAGI stands in.
    let magi = magiProxy;
    magiByAge.set(age, magi);
    const lookbackMagi = magiByAge.get(age - IRMAA_LOOKBACK_YEARS) ?? input.preSimulationMagi ?? magi;
    const irmaa = age >= MEDICARE_AGE ? irmaaAnnualSurcharge(lookbackMagi, filingStatus, inflationFactor) : 0;

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
        fedOrdinaryTax(taxableIncome)
        - fedOrdinaryTax(taxableIncome - conversion)
        + conversion * input.stateTaxRate,
      );
      const ltvRoom = Math.max(0, (sbloc.maxLtv ?? DEFAULT_SBLOC_MAX_LTV) * brokerageBalance - sblocLoanBalance);
      sblocDraw = roundCurrency(Math.min(conversionTax, totalTax + irmaa, ltvRoom));
      sblocLoanBalance = roundCurrency(sblocLoanBalance + sblocDraw);
    }

    const totalOutflow = roundCurrency(totalTax + irmaa - sblocDraw);
    // Selling brokerage to pay taxes realizes gains pro-rata (same lot mix as any other
    // sale — not a basis-first fiction), and that gain triggers more capital-gains tax,
    // NIIT, and state tax, requiring a slightly larger sale. Solved by fixed-point
    // iteration, the same pattern as the traditional gross-up below.
    const paymentGainFraction = brokerageBalance > 0 ? Math.max(0, brokerageBalance - brokerageBasis) / brokerageBalance : 0;
    const cgTaxBase = capitalGainsFederalTax(investmentGains, ordinaryTaxableAfterDeductions, filingStatus, inflationFactor)
      + netInvestmentIncomeTax(investmentGains, magi, filingStatus);
    const paymentSaleTax = (sale: number): number => {
      const gain = sale * paymentGainFraction;
      if (gain <= 0) return 0;
      const fedDelta = capitalGainsFederalTax(investmentGains + gain, ordinaryTaxableAfterDeductions, filingStatus, inflationFactor)
        + netInvestmentIncomeTax(investmentGains + gain, magi + gain, filingStatus)
        - cgTaxBase;
      return roundCurrency(fedDelta + gain * input.stateTaxRate);
    };
    let sale = Math.min(brokerageBalance, totalOutflow);
    if (paymentGainFraction > 0 && totalOutflow > 0) {
      for (let i = 0; i < 20; i++) {
        const next = Math.min(brokerageBalance, roundCurrency(totalOutflow + paymentSaleTax(sale)));
        if (Math.abs(next - sale) < 0.01) {
          sale = next;
          break;
        }
        sale = next;
      }
    }
    const saleTax = paymentSaleTax(sale);
    const saleGain = roundCurrency(sale * paymentGainFraction);
    if (saleTax > 0) {
      // Fold the payment-sale gain into the year's reported taxes and MAGI
      stateTax = roundCurrency(stateTax + saleGain * input.stateTaxRate);
      federalTax = roundCurrency(federalTax + saleTax - saleGain * input.stateTaxRate);
      totalTax = roundCurrency(federalTax + stateTax);
      magi = roundCurrency(magi + saleGain);
      magiByAge.set(age, magi);
    }
    const owed = roundCurrency(totalOutflow + saleTax);
    let taxFromBrokerage = sale;
    let actualRothDeposit = conversion;
    let unpaidOutflow = 0;
    brokerageBalance = roundCurrency(brokerageBalance - sale);
    brokerageBasis = roundCurrency(Math.max(0, brokerageBasis - sale * (1 - paymentGainFraction)));
    if (roundCurrency(owed - sale) > 0.01) {
      // Brokerage exhausted: the remainder falls to the existing waterfall
      const unpaidTax = roundCurrency(owed - sale);
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
    brokerageBasis = Math.min(brokerageBasis, brokerageBalance);

    // Taxes still unpaid after brokerage and conversion withholding are funded from the
    // remaining traditional balance before Roth is touched — draining pre-tax dollars at
    // today's marginal rate beats spending tax-free Roth to preserve them. The withdrawal
    // is itself ordinary income, so it is grossed up for the extra tax it creates (solved
    // by fixed-point iteration), even when that spills into a higher bracket.
    let taxFromTraditional = 0;
    let grossUpPenalty = 0;
    if (unpaidOutflow > 0 && traditionalBalance > 0) {
      const baseFederalTax = fedOrdinaryTax(taxableIncome);
      // Before 59½ the withdrawal is an early distribution, so the gross-up must also
      // cover its own 10% penalty
      const grossUpTax = (extra: number): number => {
        const ssTaxable = roundCurrency(taxableSocialSecurity(ssIncome, nonSsOrdinaryIncome + extra, filingStatus));
        const fedDelta = fedOrdinaryTax(roundCurrency(nonSsOrdinaryIncome + extra + ssTaxable)) - baseFederalTax;
        const penalty = age < 59.5 ? 0.1 * extra : 0;
        return roundCurrency(fedDelta + penalty + extra * input.stateTaxRate);
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
      grossUpPenalty = age < 59.5 ? roundCurrency(0.1 * withdrawal) : 0;
      taxFromTraditional = withdrawal;
      traditionalBalance = roundCurrency(traditionalBalance - withdrawal);
      unpaidOutflow = roundCurrency(Math.max(0, unpaidOutflow + extraTax - withdrawal));
      // Fold the gross-up income into the year's reported income, tax, and MAGI figures
      taxableSsIncome = roundCurrency(taxableSocialSecurity(ssIncome, nonSsOrdinaryIncome + withdrawal, filingStatus));
      taxableIncome = roundCurrency(nonSsOrdinaryIncome + withdrawal + taxableSsIncome);
      stateTax = roundCurrency(stateTax + withdrawal * input.stateTaxRate);
      federalTax = roundCurrency(federalTax + extraTax - withdrawal * input.stateTaxRate);
      totalTax = roundCurrency(federalTax + stateTax);
      marginalRate = getMarginalBracket(taxableIncome, filingStatus, taxYear, inflationFactor).rate;
      magi = roundCurrency(taxableIncome + realizedGain + dividends + saleGain);
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

    const growthRate = input.returnRateForYear ? input.returnRateForYear(age, age - startAge) : input.assumedReturnRate;
    traditionalBalance = roundCurrency(traditionalBalance * (1 + growthRate));
    rothBalance = roundCurrency(rothBalance * (1 + growthRate));
    brokerageBalance = roundCurrency(brokerageBalance * (1 + growthRate));
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
      earlyWithdrawalPenalty: roundCurrency(expensePenalty + grossUpPenalty),
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
