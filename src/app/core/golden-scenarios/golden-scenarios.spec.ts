import { runScenario } from '../calculators/scenario-engine';
import { runMonteCarloSmoothIncomeTarget } from '../calculators/monte-carlo';
import { createPortfolioReturnSampler, createSeededRng } from '../calculators/monte-carlo-returns';
import { findEarliestFeasibleRetirementAge } from '../calculators/retirement-age-search';
import {
  GOLDEN_SEED,
  accumulationAccounts,
  accumulationScenario,
  aggregationAccounts,
  aggregationScenario,
  constrainedAfterTaxContributionScenario,
  monteCarloAccounts,
  monteCarloScenario,
  retirementSearchAccounts,
  retirementSearchScenario,
} from './golden-scenarios';

function sampleStats(stockAllocation: number, count = 20000): { mean: number; standardDeviation: number } {
  const sampler = createPortfolioReturnSampler(
    createSeededRng(GOLDEN_SEED),
    0.06,
    stockAllocation,
  );
  const values = Array.from({ length: count }, () => sampler());
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, standardDeviation: Math.sqrt(variance) };
}

describe('golden retirement scenarios', () => {
  it('1: accumulates three working years exactly and constrains after-tax contributions to available cash', () => {
    const accumulation = runScenario(accumulationScenario, accumulationAccounts);

    expect(accumulation.years.map((year) => year.age)).toEqual([55, 56, 57]);
    expect(accumulation.totalTax).toBe(0);
    expect(accumulation.endingAssets).toBe(205000);
    expect(accumulation.years.at(-1)!.traditionalBalance).toBe(175000);
    expect(accumulation.years.at(-1)!.brokerageBalance).toBe(30000);

    const constrained = runScenario(constrainedAfterTaxContributionScenario, []);
    const [year] = constrained.years;
    expect(year.rothBalance).toBe(1180);
    expect(year.shortfall).toBe(0);
    // The requested $20k Roth contribution cannot be funded by selling old assets because
    // this fixture starts with no assets. Whatever reaches Roth must come from post-tax cash.
    expect(year.endingAssets).toBe(year.rothBalance + year.brokerageBalance + year.traditionalBalance);
  });

  it('2: includes every same-type account and aggregates brokerage cost basis', () => {
    const result = runScenario(aggregationScenario, aggregationAccounts);
    const [year] = result.years;

    expect(year.traditionalBalance).toBe(500000);
    expect(year.rothBalance).toBe(150000);
    expect(year.brokerageBalance).toBe(100000);
    expect(year.brokerageBasis).toBe(65000);
    expect(year.endingAssets).toBe(750000);
  });

  it('3: preserves paired stock/bond history and gives 60/40 materially lower volatility than all-stock', () => {
    const allStock = sampleStats(1);
    const balanced = sampleStats(0.6);

    expect(balanced.standardDeviation).toBeLessThan(allStock.standardDeviation);
    expect(balanced.standardDeviation).toBeLessThan(allStock.standardDeviation * 0.8);
    // Both samplers are shifted to the same target compound return; their arithmetic means
    // need not match exactly, but neither should drift to an implausible level.
    expect(allStock.mean).toBeCloseTo(0.0763342392, 8);
    expect(allStock.standardDeviation).toBeCloseTo(0.1945641084, 8);
    expect(balanced.mean).toBeCloseTo(0.0656754729, 8);
    expect(balanced.standardDeviation).toBeCloseTo(0.1214204489, 8);
  });

  it('4: keeps the six Return x Guardrail cells reproducible with common random numbers', () => {
    const rates = [0.05, 0.06, 0.07];
    const first = rates.map((rate) => {
      const scenario = { ...monteCarloScenario, assumedReturnRate: rate };
      return {
        rate,
        off: runMonteCarloSmoothIncomeTarget(scenario, monteCarloAccounts, 300, GOLDEN_SEED, false),
        on: runMonteCarloSmoothIncomeTarget(scenario, monteCarloAccounts, 300, GOLDEN_SEED, true),
      };
    });
    const second = rates.map((rate) => {
      const scenario = { ...monteCarloScenario, assumedReturnRate: rate };
      return {
        rate,
        off: runMonteCarloSmoothIncomeTarget(scenario, monteCarloAccounts, 300, GOLDEN_SEED, false),
        on: runMonteCarloSmoothIncomeTarget(scenario, monteCarloAccounts, 300, GOLDEN_SEED, true),
      };
    });

    expect(first.map((row) => row.off.successProbability)).toEqual(
      second.map((row) => row.off.successProbability),
    );
    expect(first.map((row) => row.on.successProbability)).toEqual(
      second.map((row) => row.on.successProbability),
    );
    expect(first.map((row) => row.off.successProbability)).toEqual([224 / 300, 268 / 300, 284 / 300]);
    expect(first.map((row) => row.on.successProbability)).toEqual([264 / 300, 285 / 300, 295 / 300]);

    for (const row of first) {
      expect(row.off.guardrailStats).toBeUndefined();
      expect(row.on.guardrailStats).toBeDefined();
      expect(row.on.guardrailStats!.triggeredProbability).toBeGreaterThan(0);
      expect(row.on.guardrailStats!.meanConsumptionRealization).toBeLessThanOrEqual(1);
      expect(row.on.successProbability).toBeGreaterThanOrEqual(row.off.successProbability);
    }
    expect(first[2].off.successProbability).toBeGreaterThanOrEqual(first[0].off.successProbability);
    expect(first[2].on.successProbability).toBeGreaterThanOrEqual(first[0].on.successProbability);
  });

  it('5: searches every requested age with one seed and returns the first qualifying age', () => {
    const criteria = {
      minimumSuccessRate: 0.75,
      minimumConsumptionRealization: 0.9,
      maximumGuardrailTriggerRate: 0.9,
      planningAge: 95,
    };
    const first = findEarliestFeasibleRetirementAge(
      retirementSearchScenario,
      retirementSearchAccounts,
      58,
      62,
      criteria,
      250,
      GOLDEN_SEED,
      true,
    );
    const second = findEarliestFeasibleRetirementAge(
      retirementSearchScenario,
      retirementSearchAccounts,
      58,
      62,
      criteria,
      250,
      GOLDEN_SEED,
      true,
    );

    expect(first.rows.map((row) => row.retirementAge)).toEqual([58, 59, 60, 61, 62]);
    expect(first).toEqual(second);
    expect(first.earliestFeasibleAge).toBe(59);
    expect(first.rows.map((row) => row.successProbability)).toEqual([0.716, 0.8, 0.872, 0.92, 0.96]);
    expect(first.earliestFeasibleAge).toBe(first.rows.find((row) => row.qualifies)?.retirementAge);
    if (first.earliestFeasibleAge != null) {
      const qualifyingIndex = first.rows.findIndex((row) => row.retirementAge === first.earliestFeasibleAge);
      expect(first.rows[qualifyingIndex].qualifies).toBeTrue();
      for (const earlier of first.rows.slice(0, qualifyingIndex)) expect(earlier.qualifies).toBeFalse();
    }
  });
});
