import { AccountSnapshot, Scenario } from '../models/retirement.models';
import { ConversionSimulationInput } from './roth-conversion-calculator';

export type ScenarioEngineInput = Omit<ConversionSimulationInput, 'strategy' | 'returnRateForYear' | 'guardrail'>;

/**
 * Single source of truth for mapping persisted scenario assumptions into the
 * yearly simulation engine. Callers add only execution-specific properties
 * such as strategy, sampled returns, or a guardrail.
 */
export function engineInputFromScenario(
  scenario: Scenario,
  accounts: AccountSnapshot[],
): ScenarioEngineInput {
  return {
    accounts,
    currentAge: scenario.currentAge,
    endAge: scenario.lifeExpectancy,
    birthYear: scenario.birthYear,
    filingStatus: scenario.filingStatus,
    assumedReturnRate: scenario.assumedReturnRate,
    stateTaxRate: scenario.stateTaxRate,
    annualLivingExpenses: scenario.annualLivingExpenses,
    annualOtherIncome: scenario.annualOtherIncome,
    annualPreTaxContribution: scenario.annualPreTaxContribution,
    annualRothContribution: scenario.annualRothContribution,
    annualBrokerageContribution: scenario.annualBrokerageContribution,
    employerMatch: scenario.employerMatch,
    wageIncome: scenario.wageIncome,
    retirementAge: scenario.retirementAge,
    ssPia: scenario.ssPia,
    ssClaimAge: scenario.ssClaimAge,
    ssColaRate: scenario.ssColaRate,
    preSimulationMagi: scenario.preSimulationMagi,
    spouseCurrentAge: scenario.spouseCurrentAge,
    spouseLifeExpectancy: scenario.spouseLifeExpectancy,
    spouseSsPia: scenario.spouseSsPia,
    spouseSsClaimAge: scenario.spouseSsClaimAge,
    allowPreRetirementConversions: scenario.allowPreRetirementConversions,
    annualWageGrowth: scenario.annualWageGrowth,
    spendingOrder: scenario.spendingOrder,
    dividendYield: scenario.dividendYield,
    sblocTaxFunding: scenario.sblocTaxFunding,
  };
}
