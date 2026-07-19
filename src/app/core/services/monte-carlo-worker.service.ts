import { Injectable } from '@angular/core';
import { AccountSnapshot, Scenario } from '../models/retirement.models';
import { MonteCarloResult, SimulationProgress, StochasticLongevityOptions, StochasticLongevityResult, runMonteCarloSmoothIncomeTargetAsync, runMonteCarloStochasticLongevity } from '../calculators/monte-carlo';
import { RetirementAgeCriteria, RetirementAgeSearchResult, findEarliestFeasibleRetirementAge } from '../calculators/retirement-age-search';

@Injectable({ providedIn: 'root' })
export class MonteCarloWorkerService {
  private sequence = 0;

  run(scenario: Scenario, accounts: AccountSnapshot[], trials: number, seed: number, useGuardrail: boolean, onProgress?: (progress: SimulationProgress) => void): Promise<MonteCarloResult> {
    if (typeof Worker === 'undefined') return runMonteCarloSmoothIncomeTargetAsync(scenario, accounts, trials, seed, useGuardrail, (completed) => onProgress?.({ completed, total: trials, phase: 'monte-carlo' }));
    return this.dispatch<MonteCarloResult>({ kind: 'monte-carlo', scenario, accounts, trials, seed, useGuardrail }, onProgress);
  }

  runStochasticLongevity(scenario: Scenario, accounts: AccountSnapshot[], options: StochasticLongevityOptions, trials: number, seed: number, useGuardrail: boolean, onProgress?: (progress: SimulationProgress) => void): Promise<StochasticLongevityResult> {
    if (typeof Worker === 'undefined') return Promise.resolve(runMonteCarloStochasticLongevity(scenario, accounts, options, trials, seed, useGuardrail, onProgress));
    return this.dispatch<StochasticLongevityResult>({ kind: 'stochastic-longevity', scenario, accounts, options, trials, seed, useGuardrail }, onProgress);
  }

  searchRetirementAge(scenario: Scenario, accounts: AccountSnapshot[], minimumAge: number, maximumAge: number, criteria: RetirementAgeCriteria, trials: number, seed: number, useGuardrail: boolean, onProgress?: (progress: SimulationProgress) => void): Promise<RetirementAgeSearchResult> {
    if (typeof Worker === 'undefined') return Promise.resolve(findEarliestFeasibleRetirementAge(scenario, accounts, minimumAge, maximumAge, criteria, trials, seed, useGuardrail, (completed, total) => onProgress?.({ completed, total, phase: 'retirement-age-search' })));
    return this.dispatch<RetirementAgeSearchResult>({ kind: 'retirement-age-search', scenario, accounts, minimumAge, maximumAge, criteria, trials, seed, useGuardrail }, onProgress);
  }

  private dispatch<T>(payload: Record<string, unknown>, onProgress?: (progress: SimulationProgress) => void): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const worker = new Worker(new URL('../workers/monte-carlo.worker', import.meta.url));
      worker.onmessage = ({ data }) => {
        if (data.id !== id) return;
        if (data.type === 'progress') {
          onProgress?.(data.progress as SimulationProgress);
          return;
        }
        worker.terminate();
        data.type === 'error' || data.error ? reject(new Error(data.error)) : resolve(data.result as T);
      };
      worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Monte Carlo worker failed.')); };
      worker.postMessage({ ...payload, id });
    });
  }
}
