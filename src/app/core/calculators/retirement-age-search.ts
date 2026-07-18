import { AccountSnapshot, Scenario } from '../models/retirement.models';
import { MonteCarloResult, runMonteCarloSmoothIncomeTarget } from './monte-carlo';

export interface RetirementAgeCriteria {
  minimumSuccessRate: number;
  minimumConsumptionRealization: number;
  maximumGuardrailTriggerRate?: number;
  planningAge: number;
}

export interface RetirementAgeRow {
  retirementAge: number;
  successProbability: number;
  consumptionRealization: number;
  guardrailTriggerRate: number;
  qualifies: boolean;
}

export interface RetirementAgeSearchResult {
  earliestFeasibleAge?: number;
  rows: RetirementAgeRow[];
  criteria: RetirementAgeCriteria;
}

export function findEarliestFeasibleRetirementAge(
  scenario: Scenario,
  accounts: AccountSnapshot[],
  minimumAge: number,
  maximumAge: number,
  criteria: RetirementAgeCriteria,
  trials: number,
  seed: number,
  useGuardrail: boolean,
): RetirementAgeSearchResult {
  const rows: RetirementAgeRow[] = [];
  for (let age = Math.max(Math.ceil(scenario.currentAge), Math.ceil(minimumAge)); age <= maximumAge; age++) {
    const candidate: Scenario = { ...scenario, retirementAge: age, lifeExpectancy: criteria.planningAge };
    const result: MonteCarloResult = runMonteCarloSmoothIncomeTarget(candidate, accounts, trials, seed, useGuardrail);
    const consumption = result.guardrailStats?.meanConsumptionRealization ?? 1;
    const trigger = result.guardrailStats?.triggeredProbability ?? 0;
    const qualifies = result.successProbability >= criteria.minimumSuccessRate
      && consumption >= criteria.minimumConsumptionRealization
      && (criteria.maximumGuardrailTriggerRate == null || trigger <= criteria.maximumGuardrailTriggerRate);
    rows.push({ retirementAge: age, successProbability: result.successProbability, consumptionRealization: consumption, guardrailTriggerRate: trigger, qualifies });
  }
  return { earliestFeasibleAge: rows.find((row) => row.qualifies)?.retirementAge, rows, criteria };
}
