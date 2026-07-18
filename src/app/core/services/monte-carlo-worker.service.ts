import { Injectable } from '@angular/core';
import { AccountSnapshot, Scenario } from '../models/retirement.models';
import { MonteCarloResult, StochasticLongevityOptions, StochasticLongevityResult, runMonteCarloSmoothIncomeTargetAsync, runMonteCarloStochasticLongevity } from '../calculators/monte-carlo';
import { RetirementAgeCriteria, RetirementAgeSearchResult, findEarliestFeasibleRetirementAge } from '../calculators/retirement-age-search';

@Injectable({ providedIn: 'root' })
export class MonteCarloWorkerService {
  private sequence = 0;

  run(scenario: Scenario, accounts: AccountSnapshot[], trials: number, seed: number, useGuardrail: boolean): Promise<MonteCarloResult> {
    if (typeof Worker === 'undefined') return runMonteCarloSmoothIncomeTargetAsync(scenario, accounts, trials, seed, useGuardrail);
    return this.dispatch<MonteCarloResult>({ kind: 'monte-carlo', scenario, accounts, trials, seed, useGuardrail });
  }

  runStochasticLongevity(scenario: Scenario, accounts: AccountSnapshot[], options: StochasticLongevityOptions, trials: number, seed: number, useGuardrail: boolean): Promise<StochasticLongevityResult> {
    if (typeof Worker === 'undefined') return Promise.resolve(runMonteCarloStochasticLongevity(scenario, accounts, options, trials, seed, useGuardrail));
    return this.dispatch<StochasticLongevityResult>({ kind: 'stochastic-longevity', scenario, accounts, options, trials, seed, useGuardrail });
  }

  searchRetirementAge(scenario: Scenario, accounts: AccountSnapshot[], minimumAge: number, maximumAge: number, criteria: RetirementAgeCriteria, trials: number, seed: number, useGuardrail: boolean): Promise<RetirementAgeSearchResult> {
    if (typeof Worker === 'undefined') return Promise.resolve(findEarliestFeasibleRetirementAge(scenario, accounts, minimumAge, maximumAge, criteria, trials, seed, useGuardrail));
    return this.dispatch<RetirementAgeSearchResult>({ kind: 'retirement-age-search', scenario, accounts, minimumAge, maximumAge, criteria, trials, seed, useGuardrail });
  }

  private dispatch<T>(payload: Record<string, unknown>): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const worker = new Worker(new URL('../workers/monte-carlo.worker', import.meta.url));
      worker.onmessage = ({ data }) => {
        if (data.id !== id) return;
        worker.terminate();
        data.error ? reject(new Error(data.error)) : resolve(data.result as T);
      };
      worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Monte Carlo worker failed.')); };
      worker.postMessage({ ...payload, id });
    });
  }
}
