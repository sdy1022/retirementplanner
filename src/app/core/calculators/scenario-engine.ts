import { AccountSnapshot, Scenario, ScenarioResult } from '../models/retirement.models';
import { simulateConversionStrategy } from './roth-conversion-calculator';

export function runScenario(scenario: Scenario, accounts: AccountSnapshot[]): ScenarioResult {
  const years = simulateConversionStrategy({
    accounts,
    strategy: scenario.rothConversionStrategy,
    currentAge: scenario.currentAge,
    endAge: scenario.lifeExpectancy,
    birthYear: scenario.birthYear,
    filingStatus: scenario.filingStatus,
    assumedReturnRate: scenario.assumedReturnRate,
    stateTaxRate: scenario.stateTaxRate,
    ssPia: scenario.ssPia,
    ssClaimAge: scenario.ssClaimAge,
  });

  return {
    scenarioName: scenario.name,
    years,
    totalTax: years.reduce((total, year) => total + year.totalTax, 0),
    endingAssets: years.at(-1)?.endingAssets ?? 0,
  };
}
