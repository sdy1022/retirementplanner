import { AccountSnapshot, Scenario, YearResult } from '../models/retirement.models';
import { simulateConversionStrategy, sumAccounts } from './roth-conversion-calculator';
import { RESIDUAL_TRADITIONAL_TAX_RATE, runScenario } from './scenario-engine';
import { createReturnSampler, createSeededRng } from './monte-carlo-returns';
import { createGuardrail, GuardrailOptions } from './spending-guardrail';

// 5,000 trials pins the success probability to roughly ±1% while keeping a full run to a
// few seconds; the async runner below chunks the work so the UI never freezes regardless.
export const DEFAULT_MONTE_CARLO_TRIALS = 5000;

// Trials simulated per chunk before yielding the main thread back to the browser
const TRIALS_PER_CHUNK = 250;

export interface MonteCarloPercentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

// One fan-chart row: the distribution of after-tax assets across trials at this age (same
// liquidation-value basis as endingAssetsPercentiles, so the two are directly comparable)
export interface MonteCarloAgePercentiles extends MonteCarloPercentiles {
  age: number;
}

// Liquidation-value basis shared by every after-tax figure in this module (and reused by
// callers, e.g. the fan-chart page's deterministic comparison line, so both are on the same
// basis): pre-tax traditional dollars are discounted by the residual tax rate and unrealized
// brokerage gains by the gains rate, matching the rest of the app's after-tax figures.
export function afterTaxAssetsForYear(year: YearResult, residualRate: number, gainsRate: number): number {
  return year.endingAssets - year.traditionalBalance * residualRate - Math.max(0, year.brokerageBalance - year.brokerageBasis) * gainsRate - (year.sblocLoanBalance ?? 0);
}

export interface MonteCarloResult {
  trials: number;
  // Fraction of trials that funded every year's expenses and taxes without a shortfall
  // through life expectancy — i.e. the plan never ran out of money.
  successProbability: number;
  meanEndingAssets: number;
  endingAssetsPercentiles: MonteCarloPercentiles;
  // Percentile bands of total assets by age across all trials — the fan chart data
  assetsByAge: MonteCarloAgePercentiles[];
}

// Runs the plan's resolved smooth-income-target strategy through many random annual-return
// sequences (geometric-mean-anchored stationary block bootstrap that replays real multi-year
// bull/bear runs, see monte-carlo-returns.ts) instead of the single flat assumedReturnRate. The strategy itself (which income ceiling,
// preserve floor, and RMD behavior) is *not* re-optimized per trial — it is solved once,
// deterministically, at the user's assumed mean return, and every trial replays that same
// fixed plan. Re-running the full bracket/ceiling/floor search per trial would be
// prohibitively expensive and would answer a different question (how would the optimizer
// respond to hindsight on this particular path) than what this is for (how robust is the
// chosen plan to variance around the assumed return).
export function runMonteCarloSmoothIncomeTarget(
  scenario: Scenario,
  accounts: AccountSnapshot[],
  trials = DEFAULT_MONTE_CARLO_TRIALS,
  seed = Date.now(),
  useGuardrail = false,
): MonteCarloResult {
  const runTrial = createTrialRunner(scenario, accounts, seed, useGuardrail);
  const endingAssets: number[] = new Array(trials);
  const assetsPerTrial: number[][] = new Array(trials);
  const ages: number[] = [];
  let successes = 0;
  for (let i = 0; i < trials; i++) {
    const trial = runTrial();
    if (trial.success) successes++;
    endingAssets[i] = trial.afterTaxEndingAssets;
    assetsPerTrial[i] = trial.assetsByYear;
    if (i === 0) ages.push(...trial.ages);
  }
  return summarize(endingAssets, successes, assetsPerTrial, ages);
}

// Same simulation, but yields the main thread between chunks so the browser can keep
// painting (spinner, progress) during a long run. onProgress reports completed trials.
export async function runMonteCarloSmoothIncomeTargetAsync(
  scenario: Scenario,
  accounts: AccountSnapshot[],
  trials = DEFAULT_MONTE_CARLO_TRIALS,
  seed = Date.now(),
  useGuardrail = false,
  onProgress?: (completedTrials: number) => void,
): Promise<MonteCarloResult> {
  const runTrial = createTrialRunner(scenario, accounts, seed, useGuardrail);
  const endingAssets: number[] = new Array(trials);
  const assetsPerTrial: number[][] = new Array(trials);
  const ages: number[] = [];
  let successes = 0;
  for (let done = 0; done < trials; ) {
    const chunkEnd = Math.min(trials, done + TRIALS_PER_CHUNK);
    for (; done < chunkEnd; done++) {
      const trial = runTrial();
      if (trial.success) successes++;
      endingAssets[done] = trial.afterTaxEndingAssets;
      assetsPerTrial[done] = trial.assetsByYear;
      if (done === 0) ages.push(...trial.ages);
    }
    onProgress?.(done);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return summarize(endingAssets, successes, assetsPerTrial, ages);
}

interface TrialOutcome {
  success: boolean;
  afterTaxEndingAssets: number;
  // After-tax assets at each simulated age, aligned with `ages` — same liquidation-value
  // basis as afterTaxEndingAssets, just computed for every year instead of only the last
  assetsByYear: number[];
  ages: number[];
}

// Resolves the concrete plan once (strategy search, spending order) and returns a closure
// that replays it under a fresh random return sequence per call. Trials share one seeded
// RNG stream (so a (scenario, seed) pair is fully reproducible), but each trial gets its own
// block-bootstrap sampler — otherwise the sampler's continue/jump state would carry across
// trial boundaries, making trial N+1 pick up mid-block where trial N left off instead of
// starting its own independent draw. That would stitch all trials into one long correlated
// path (verified: ~81% of trial boundaries would silently continue the previous trial's
// sequence, vs ~1% for truly independent trials), inflating the effective correlation
// between trials and making the reported percentiles/success-rate less reliable than a
// sample of `trials` independent runs.
function createTrialRunner(scenario: Scenario, accounts: AccountSnapshot[], seed: number, useGuardrail: boolean, guardrailOptions?: GuardrailOptions): () => TrialOutcome {
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

  // Reference plan for the guardrail: the deterministic (flat-return) balances, reindexed
  // from "ending assets at age A" to "beginning-of-year assets at age A+1" so it lines up
  // with the beginningAssets a trial reports for that same age.
  const beginningAssetsBaselineByAge = new Map<number, number>();
  if (useGuardrail) {
    beginningAssetsBaselineByAge.set(
      Math.floor(scenario.currentAge),
      sumAccounts(accounts, ['traditional_401k', 'traditional_ira', 'roth_401k', 'roth_ira', 'brokerage']),
    );
    for (const year of base.years) beginningAssetsBaselineByAge.set(year.age + 1, year.endingAssets);
  }

  const residualRate = scenario.residualTaxRate ?? RESIDUAL_TRADITIONAL_TAX_RATE;
  const gainsRate = scenario.brokerageGainsTaxRate ?? 0;
  // Applied to every year (not just the last) so the fan chart and the final-year summary
  // percentiles are on the same basis and directly comparable.
  const afterTaxAssets = (y: YearResult): number => afterTaxAssetsForYear(y, residualRate, gainsRate);

  const rng = createSeededRng(seed);

  return () => {
    // Fresh sampler per trial: draws from the shared rng stream (so the overall sequence
    // is still deterministic per seed), but resets the block-continuation state so this
    // trial's return path doesn't pick up mid-block from the previous trial. The guardrail
    // needs the same treatment — a fresh instance per trial so "currently in cut mode"
    // doesn't leak across trial boundaries either.
    const sampleReturn = createReturnSampler(rng, scenario.assumedReturnRate);
    const guardrail = useGuardrail ? createGuardrail(beginningAssetsBaselineByAge, guardrailOptions) : undefined;
    const years = simulateConversionStrategy({
      accounts,
      strategy: resolvedStrategy,
      currentAge: scenario.currentAge,
      endAge: scenario.lifeExpectancy,
      birthYear: scenario.birthYear,
      filingStatus: scenario.filingStatus,
      assumedReturnRate: scenario.assumedReturnRate,
      returnRateForYear: sampleReturn,
      guardrail,
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
    const last = years.at(-1);
    return {
      success: years.every((y) => y.shortfall <= 0.01),
      afterTaxEndingAssets: last ? afterTaxAssets(last) : 0,
      assetsByYear: years.map(afterTaxAssets),
      ages: years.map((y) => y.age),
    };
  };
}

function percentilesOf(sorted: number[]): MonteCarloPercentiles {
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) };
}

function summarize(endingAssets: number[], successes: number, assetsPerTrial: number[][], ages: number[]): MonteCarloResult {
  const sorted = [...endingAssets].sort((a, b) => a - b);
  // Transpose trials × years into per-age distributions for the fan chart
  const assetsByAge = ages.map((age, yearIndex) => {
    const atAge = assetsPerTrial.map((trial) => trial[yearIndex]).sort((a, b) => a - b);
    return { age, ...percentilesOf(atAge) };
  });
  return {
    trials: sorted.length,
    successProbability: successes / sorted.length,
    meanEndingAssets: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
    endingAssetsPercentiles: percentilesOf(sorted),
    assetsByAge,
  };
}
