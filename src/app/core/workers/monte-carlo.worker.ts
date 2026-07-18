/// <reference lib="webworker" />
import { runMonteCarloSmoothIncomeTarget, runMonteCarloStochasticLongevity } from '../calculators/monte-carlo';
import { findEarliestFeasibleRetirementAge } from '../calculators/retirement-age-search';

addEventListener('message', ({ data }) => {
  try {
    const result = data.kind === 'retirement-age-search'
      ? findEarliestFeasibleRetirementAge(data.scenario, data.accounts, data.minimumAge, data.maximumAge, data.criteria, data.trials, data.seed, data.useGuardrail)
      : data.kind === 'stochastic-longevity'
        ? runMonteCarloStochasticLongevity(data.scenario, data.accounts, data.options, data.trials, data.seed, data.useGuardrail)
        : runMonteCarloSmoothIncomeTarget(data.scenario, data.accounts, data.trials, data.seed, data.useGuardrail);
    postMessage({ id: data.id, result });
  } catch (error) {
    postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
});
