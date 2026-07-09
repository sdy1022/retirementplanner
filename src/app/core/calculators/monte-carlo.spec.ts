import { Scenario } from '../models/retirement.models';
import { runMonteCarloSmoothIncomeTarget } from './monte-carlo';

describe('monte-carlo', () => {
  const wellFundedScenario: Scenario = {
    name: 'Income ceiling',
    currentAge: 60,
    retirementAge: 60,
    birthYear: 1966,
    ssClaimAge: 67,
    ssPia: 2800,
    lifeExpectancy: 90,
    filingStatus: 'single',
    rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
    assumedReturnRate: 0.06,
    stateTaxRate: 0.03,
    wageIncome: 0,
    annualLivingExpenses: 40000,
  };
  const wellFundedAccounts = [
    { type: 'traditional_401k' as const, balance: 2000000, snapshotDate: '2026-01-01' },
    { type: 'brokerage' as const, balance: 500000, snapshotDate: '2026-01-01' },
  ];

  it('rejects scenarios that are not smooth-income-target', () => {
    const scenario: Scenario = { ...wellFundedScenario, rothConversionStrategy: { mode: 'none' } };
    expect(() => runMonteCarloSmoothIncomeTarget(scenario, wellFundedAccounts, 10, 1)).toThrow();
  });

  it('runs the requested number of trials and returns a well-formed result', () => {
    const result = runMonteCarloSmoothIncomeTarget(wellFundedScenario, wellFundedAccounts, 300, 1);

    expect(result.trials).toBe(300);
    expect(result.successProbability).toBeGreaterThanOrEqual(0);
    expect(result.successProbability).toBeLessThanOrEqual(1);
    const p = result.endingAssetsPercentiles;
    expect(p.p10).toBeLessThanOrEqual(p.p25);
    expect(p.p25).toBeLessThanOrEqual(p.p50);
    expect(p.p50).toBeLessThanOrEqual(p.p75);
    expect(p.p75).toBeLessThanOrEqual(p.p90);
  });

  it('is deterministic for a fixed seed', () => {
    const a = runMonteCarloSmoothIncomeTarget(wellFundedScenario, wellFundedAccounts, 200, 42);
    const b = runMonteCarloSmoothIncomeTarget(wellFundedScenario, wellFundedAccounts, 200, 42);
    expect(a).toEqual(b);
  });

  it('a comfortably funded plan succeeds far more often than a barely funded one', () => {
    const comfortable = runMonteCarloSmoothIncomeTarget(wellFundedScenario, wellFundedAccounts, 500, 7);

    const thinAccounts = [
      { type: 'traditional_401k' as const, balance: 300000, snapshotDate: '2026-01-01' },
      { type: 'brokerage' as const, balance: 20000, snapshotDate: '2026-01-01' },
    ];
    const thin = runMonteCarloSmoothIncomeTarget(
      { ...wellFundedScenario, annualLivingExpenses: 80000 },
      thinAccounts,
      500,
      7,
    );

    expect(comfortable.successProbability).toBeGreaterThan(thin.successProbability);
  });
});
