import { AccountSnapshot, Scenario, YearResult } from '../models/retirement.models';
import { simulateConversionStrategy } from './roth-conversion-calculator';
import { RESIDUAL_TRADITIONAL_TAX_RATE, runScenario } from './scenario-engine';
import { createSeededRng, sampleAnnualReturn } from './monte-carlo-returns';

export const DEFAULT_MONTE_CARLO_TRIALS = 20000;

export interface MonteCarloPercentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloResult {
  trials: number;
  // Fraction of trials that funded every year's expenses and taxes without a shortfall
  // through life expectancy — i.e. the plan never ran out of money.
  successProbability: number;
  meanEndingAssets: number;
  endingAssetsPercentiles: MonteCarloPercentiles;
}

// Runs the plan's resolved smooth-income-target strategy through many random annual-return
// sequences (mean-adjusted historical bootstrap, see monte-carlo-returns.ts) instead of the
// single flat assumedReturnRate. The strategy itself (which income ceiling, preserve floor,
// and RMD behavior) is *not* re-optimized per trial — it is solved once, deterministically,
// at the user's assumed mean return, and every trial replays that same fixed plan. Re-running
// the full bracket/ceiling/floor search per trial would be prohibitively expensive at 20k+
// trials and would answer a different question (how would the optimizer respond to hindsight
// on this particular path) than what this is for (how robust is the chosen plan to variance
// around the assumed return).
export function runMonteCarloSmoothIncomeTarget(
  scenario: Scenario,
  accounts: AccountSnapshot[],
  trials = DEFAULT_MONTE_CARLO_TRIALS,
  seed = Date.now(),
): MonteCarloResult {
  if (scenario.rothConversionStrategy.mode !== 'smooth-income-target') {
    throw new Error('Monte Carlo verification currently supports the smooth-income-target strategy only.');
  }

  const base = runScenario(scenario, accounts);
  const resolvedStrategy = base.resolvedStrategy;
  if (!resolvedStrategy) {
    throw new Error('Could not resolve a concrete smooth-income-target strategy to simulate.');
  }
  const spendingOrder = base.resolvedSpendingOrder ?? scenario.spendingOrder;
  const allowPreRetirementConversions = base.resolvedAllowPreRetirementConversions ?? scenario.allowPreRetirementConversions;

  const residualRate = scenario.residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE;
  const gainsRate = scenario.brokerageGainsTaxRate ?? 0;
  const afterTaxEndingAssets = (years: YearResult[]): number => {
    const last = years.at(-1);
    if (!last) return 0;
    return last.endingAssets - last.traditionalBalance * residualRate - Math.max(0, last.brokerageBalance - last.brokerageBasis) * gainsRate - (last.sblocLoanBalance ?? 0);
  };

  const rng = createSeededRng(seed);
  const endingAssets: number[] = new Array(trials);
  let successes = 0;

  for (let i = 0; i < trials; i++) {
    const years = simulateConversionStrategy({
      accounts,
      strategy: resolvedStrategy,
      currentAge: scenario.currentAge,
      endAge: scenario.lifeExpectancy,
      birthYear: scenario.birthYear,
      filingStatus: scenario.filingStatus,
      assumedReturnRate: scenario.assumedReturnRate,
      returnRateForYear: () => sampleAnnualReturn(rng, scenario.assumedReturnRate),
      stateTaxRate: scenario.stateTaxRate,
      wageIncome: scenario.wageIncome,
      annualOtherIncome: scenario.annualOtherIncome,
      annualLivingExpenses: scenario.annualLivingExpenses,
      retirementAge: scenario.retirementAge,
      ssPia: scenario.ssPia,
      ssClaimAge: scenario.ssClaimAge,
      allowPreRetirementConversions,
      annualWageGrowth: scenario.annualWageGrowth,
      spendingOrder,
      dividendYield: scenario.dividendYield,
      sblocTaxFunding: scenario.sblocTaxFunding,
    });

    if (years.every((y) => y.shortfall <= 0.01)) successes++;
    endingAssets[i] = afterTaxEndingAssets(years);
  }

  endingAssets.sort((a, b) => a - b);
  const percentile = (p: number) => endingAssets[Math.min(endingAssets.length - 1, Math.floor(p * endingAssets.length))];

  return {
    trials,
    successProbability: successes / trials,
    meanEndingAssets: endingAssets.reduce((sum, v) => sum + v, 0) / endingAssets.length,
    endingAssetsPercentiles: {
      p10: percentile(0.1),
      p25: percentile(0.25),
      p50: percentile(0.5),
      p75: percentile(0.75),
      p90: percentile(0.9),
    },
  };
}
