/// <reference lib="webworker" />
import { runMonteCarloSmoothIncomeTarget, runMonteCarloStochasticLongevity } from '../calculators/monte-carlo';
import { findEarliestFeasibleRetirementAge } from '../calculators/retirement-age-search';

addEventListener('message', ({ data }) => {
  const progress = (completed: number, total: number, phase: string) =>
    postMessage({ id: data.id, type: 'progress', progress: { completed, total, phase } });
  try {
    const result = data.kind === 'retirement-age-search'
      ? findEarliestFeasibleRetirementAge(
          data.scenario, data.accounts, data.minimumAge, data.maximumAge, data.criteria,
          data.trials, data.seed, data.useGuardrail,
          (completed, total) => progress(completed, total, 'retirement-age-search'),
        )
      : data.kind === 'stochastic-longevity'
        ? runMonteCarloStochasticLongevity(
            data.scenario, data.accounts, data.options, data.trials, data.seed, data.useGuardrail,
            (p) => progress(p.completed, p.total, p.phase),
          )
        : runMonteCarloSmoothIncomeTarget(
            data.scenario, data.accounts, data.trials, data.seed, data.useGuardrail,
            (p) => progress(p.completed, p.total, p.phase),
          );
    postMessage({ id: data.id, type: 'result', result });
  } catch (error) {
    postMessage({ id: data.id, type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
});
