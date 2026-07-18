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
  // through life expectancy — i.e. the plan never ran out of money. This is a
  // model-conditional success rate (single asset class, fixed inflation, fixed lifespan,
  // fixed strategy), not a calibrated real-world probability — see the disclaimer shown
  // alongside it in the UI.
  successProbability: number;
  meanEndingAssets: number;
  endingAssetsPercentiles: MonteCarloPercentiles;
  // Percentile bands of total assets by age across all trials — the fan chart data
  assetsByAge: MonteCarloAgePercentiles[];
  // How often and how long the adaptive-spending guardrail actually cut spending across
  // trials. Undefined when the guardrail wasn't used for this run. The current guardrail
  // has a single fixed cut size (10%, see spending-guardrail.ts), not graduated severity
  // tiers, so this reports trigger frequency/duration rather than cut-size buckets.
  guardrailStats?: {
    triggeredProbability: number;
    meanYearsInCutMode: number;
    medianYearsInCutMode: number;
    p90YearsInCutMode: number;
    meanConsecutiveCutYears: number;
    meanConsumptionRealization: number;
    p10ConsumptionRealization: number;
  };
  // Magnitude of the shortfall among trials that failed (undefined when every trial
  // succeeded) — turns a bare failure count into a sense of how bad a typical failure is.
  failureStats?: {
    medianShortfall: number;
    p90Shortfall: number;
  };
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
  const successFlags: boolean[] = new Array(trials);
  const yearsInCutMode: number[] = new Array(trials);
  const maxConsecutiveCuts: number[] = new Array(trials);
  const totalShortfalls: number[] = new Array(trials);
  const consumptionRealizations: number[] = new Array(trials);
  let successes = 0;
  for (let i = 0; i < trials; i++) {
    const trial = runTrial();
    if (trial.success) successes++;
    endingAssets[i] = trial.afterTaxEndingAssets;
    assetsPerTrial[i] = trial.assetsByYear;
    successFlags[i] = trial.success;
    yearsInCutMode[i] = trial.yearsInCutMode;
    maxConsecutiveCuts[i] = trial.maxConsecutiveCuts;
    totalShortfalls[i] = trial.totalShortfall;
    consumptionRealizations[i] = trial.consumptionRealization;
    if (i === 0) ages.push(...trial.ages);
  }
  return summarize(endingAssets, successes, assetsPerTrial, ages, successFlags, yearsInCutMode, maxConsecutiveCuts, totalShortfalls, consumptionRealizations, useGuardrail);
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
  const successFlags: boolean[] = new Array(trials);
  const yearsInCutMode: number[] = new Array(trials);
  const maxConsecutiveCuts: number[] = new Array(trials);
  const totalShortfalls: number[] = new Array(trials);
  const consumptionRealizations: number[] = new Array(trials);
  let successes = 0;
  for (let done = 0; done < trials; ) {
    const chunkEnd = Math.min(trials, done + TRIALS_PER_CHUNK);
    for (; done < chunkEnd; done++) {
      const trial = runTrial();
      if (trial.success) successes++;
      endingAssets[done] = trial.afterTaxEndingAssets;
      assetsPerTrial[done] = trial.assetsByYear;
      successFlags[done] = trial.success;
      yearsInCutMode[done] = trial.yearsInCutMode;
      maxConsecutiveCuts[done] = trial.maxConsecutiveCuts;
      totalShortfalls[done] = trial.totalShortfall;
      consumptionRealizations[done] = trial.consumptionRealization;
      if (done === 0) ages.push(...trial.ages);
    }
    onProgress?.(done);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return summarize(endingAssets, successes, assetsPerTrial, ages, successFlags, yearsInCutMode, maxConsecutiveCuts, totalShortfalls, consumptionRealizations, useGuardrail);
}

interface TrialOutcome {
  success: boolean;
  afterTaxEndingAssets: number;
  // After-tax assets at each simulated age, aligned with `ages` — same liquidation-value
  // basis as afterTaxEndingAssets, just computed for every year instead of only the last
  assetsByYear: number[];
  ages: number[];
  // Number of simulated years the guardrail cut living expenses in this trial (0 when the
  // guardrail wasn't used, or simply never triggered).
  yearsInCutMode: number;
  maxConsecutiveCuts: number;
  // Sum of every year's shortfall (dollars of expenses/taxes the plan couldn't fund) —
  // near-zero for successful trials by construction (success requires shortfall <= 0.01
  // every year), meaningful for failed trials.
  totalShortfall: number;
  consumptionRealization: number;
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
  const plannedConsumption = base.years.reduce((sum, y) => sum + y.livingExpenses, 0);

  return () => {
    // Fresh sampler per trial: draws from the shared rng stream (so the overall sequence
    // is still deterministic per seed), but resets the block-continuation state so this
    // trial's return path doesn't pick up mid-block from the previous trial. The guardrail
    // needs the same treatment — a fresh instance per trial so "currently in cut mode"
    // doesn't leak across trial boundaries either.
    const sampleReturn = createReturnSampler(rng, scenario.assumedReturnRate);
    const rawGuardrail = useGuardrail ? createGuardrail(beginningAssetsBaselineByAge, guardrailOptions) : undefined;
    // Records which simulated years the guardrail actually cut spending, without changing
    // its decisions — lets the trial report guardrail trigger frequency/duration alongside
    // the success rate (see MonteCarloResult.guardrailStats).
    let cutYearCount = 0;
    let maxConsecutiveCuts = 0;
    let currentConsecutiveCuts = 0;
    const guardrail = rawGuardrail
      ? (params: { age: number; beginningAssets: number }) => {
          const decision = rawGuardrail(params);
          if (decision.livingExpenseMultiplier < 1) {
            cutYearCount++;
            currentConsecutiveCuts++;
            if (currentConsecutiveCuts > maxConsecutiveCuts) maxConsecutiveCuts = currentConsecutiveCuts;
          } else {
            currentConsecutiveCuts = 0;
          }
          return decision;
        }
      : undefined;
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
      annualPreTaxContribution: scenario.annualPreTaxContribution,
      annualRothContribution: scenario.annualRothContribution,
      annualBrokerageContribution: scenario.annualBrokerageContribution,
      employerMatch: scenario.employerMatch,
      retirementAge: scenario.retirementAge,
      ssPia: scenario.ssPia,
      ssClaimAge: scenario.ssClaimAge,
      ssColaRate: scenario.ssColaRate,
      preSimulationMagi: scenario.preSimulationMagi,
      spouseCurrentAge: scenario.spouseCurrentAge,
      spouseLifeExpectancy: scenario.spouseLifeExpectancy,
      spouseSsPia: scenario.spouseSsPia,
      spouseSsClaimAge: scenario.spouseSsClaimAge,
      allowPreRetirementConversions,
      annualWageGrowth: scenario.annualWageGrowth,
      spendingOrder,
      dividendYield: scenario.dividendYield,
      sblocTaxFunding: scenario.sblocTaxFunding,
    });
    const last = years.at(-1);
    const actualConsumption = years.reduce((sum, y) => sum + y.expensesFromSs + y.expensesFromRmd + y.expensesFromTraditional + y.expensesFromBrokerage + y.expensesFromRoth, 0);
    return {
      success: years.every((y) => y.shortfall <= 0.01),
      afterTaxEndingAssets: last ? afterTaxAssets(last) : 0,
      assetsByYear: years.map(afterTaxAssets),
      ages: years.map((y) => y.age),
      yearsInCutMode: cutYearCount,
      maxConsecutiveCuts,
      totalShortfall: years.reduce((sum, y) => sum + Math.max(0, y.shortfall), 0),
      consumptionRealization: plannedConsumption > 0 ? actualConsumption / plannedConsumption : 1,
    };
  };
}

function percentilesOf(sorted: number[]): MonteCarloPercentiles {
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) };
}

// Single-percentile helper for the guardrail/failure summaries below, which only need one
// cut point each rather than the full five-point MonteCarloPercentiles shape.
function percentileOf(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function summarize(
  endingAssets: number[],
  successes: number,
  assetsPerTrial: number[][],
  ages: number[],
  successFlags: boolean[],
  yearsInCutMode: number[],
  maxConsecutiveCuts: number[],
  totalShortfalls: number[],
  consumptionRealizations: number[],
  useGuardrail: boolean,
): MonteCarloResult {
  const sorted = [...endingAssets].sort((a, b) => a - b);
  const assetsByAge = ages.map((age, yearIndex) => {
    const atAge = assetsPerTrial.map((trial) => trial[yearIndex]).sort((a, b) => a - b);
    return { age, ...percentilesOf(atAge) };
  });

  let guardrailStats: MonteCarloResult['guardrailStats'];
  if (useGuardrail) {
    const triggered = yearsInCutMode.filter((y) => y > 0);
    const triggeredSorted = [...triggered].sort((a, b) => a - b);
    const triggeredConsecutive = maxConsecutiveCuts.filter((_, i) => yearsInCutMode[i] > 0);
    
    const sortedConsumption = [...consumptionRealizations].sort((a, b) => a - b);

    guardrailStats = {
      triggeredProbability: triggered.length / yearsInCutMode.length,
      meanYearsInCutMode: triggered.length ? triggered.reduce((a, b) => a + b, 0) / triggered.length : 0,
      medianYearsInCutMode: triggeredSorted.length ? percentileOf(triggeredSorted, 0.5) : 0,
      p90YearsInCutMode: triggeredSorted.length ? percentileOf(triggeredSorted, 0.9) : 0,
      meanConsecutiveCutYears: triggeredConsecutive.length ? triggeredConsecutive.reduce((a, b) => a + b, 0) / triggeredConsecutive.length : 0,
      meanConsumptionRealization: sortedConsumption.reduce((a, b) => a + b, 0) / sortedConsumption.length,
      p10ConsumptionRealization: percentileOf(sortedConsumption, 0.1),
    };
  }

  let failureStats: MonteCarloResult['failureStats'];
  const failedShortfalls = totalShortfalls.filter((_, i) => !successFlags[i]).sort((a, b) => a - b);
  if (failedShortfalls.length) {
    failureStats = {
      medianShortfall: percentileOf(failedShortfalls, 0.5),
      p90Shortfall: percentileOf(failedShortfalls, 0.9),
    };
  }

  return {
    trials: sorted.length,
    successProbability: successes / sorted.length,
    meanEndingAssets: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
    endingAssetsPercentiles: percentilesOf(sorted),
    assetsByAge,
    guardrailStats,
    failureStats,
  };
}
