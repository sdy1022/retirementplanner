import { Scenario } from '../models/retirement.models';
import { findEarliestFeasibleRetirementAge } from './retirement-age-search';

describe('retirement-age search', () => {
  const scenario: Scenario = {
    name: 'Search', currentAge: 60, retirementAge: 60, birthYear: 1966,
    ssClaimAge: 67, ssPia: 2800, lifeExpectancy: 90, filingStatus: 'single',
    rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
    assumedReturnRate: 0.06, stockAllocation: 0.6, stateTaxRate: 0.03,
    wageIncome: 0, annualLivingExpenses: 40000,
  };
  const accounts = [
    { type: 'traditional_401k' as const, balance: 2000000, snapshotDate: '2026-01-01' },
    { type: 'brokerage' as const, balance: 500000, snapshotDate: '2026-01-01' },
  ];

  it('tests every requested age with common random numbers and returns the first qualifier', () => {
    const result = findEarliestFeasibleRetirementAge(
      scenario, accounts, 60, 62,
      { minimumSuccessRate: 0.5, minimumConsumptionRealization: 0.9, planningAge: 90 },
      50, 123, true,
    );
    expect(result.rows.map(row => row.retirementAge)).toEqual([60, 61, 62]);
    expect(result.earliestFeasibleAge).toBe(60);
  });
});
