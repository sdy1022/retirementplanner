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
    // Fan-chart data: one row per simulated age (60..90), each with ordered bands
    expect(result.assetsByAge.length).toBe(31);
    expect(result.assetsByAge[0].age).toBe(60);
    expect(result.assetsByAge.at(-1)!.age).toBe(90);
    for (const row of result.assetsByAge) {
      expect(row.p10).toBeLessThanOrEqual(row.p50);
      expect(row.p50).toBeLessThanOrEqual(row.p90);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const a = runMonteCarloSmoothIncomeTarget(wellFundedScenario, wellFundedAccounts, 200, 42);
    const b = runMonteCarloSmoothIncomeTarget(wellFundedScenario, wellFundedAccounts, 200, 42);
    expect(a).toEqual(b);
  });

  it('the fan chart is on the same after-tax basis as the summary percentiles, not gross assets', () => {
    // Regression test: assetsByAge used to be built from raw year.endingAssets (gross,
    // pre-tax-on-liquidation), while endingAssetsPercentiles was after-tax — so the same
    // percentile label ("10th percentile") meant two different numbers depending on which
    // part of the page you read. Both are now computed via afterTaxAssetsForYear, so the
    // final-age row of the fan chart must land exactly on the summary percentiles.
    const heavyTraditionalAccounts = [
      { type: 'traditional_401k' as const, balance: 2400000, snapshotDate: '2026-01-01' },
      { type: 'brokerage' as const, balance: 100000, snapshotDate: '2026-01-01' },
    ];
    const result = runMonteCarloSmoothIncomeTarget(wellFundedScenario, heavyTraditionalAccounts, 300, 3);
    const finalRow = result.assetsByAge.at(-1)!;
    expect(finalRow.p10).toBe(result.endingAssetsPercentiles.p10);
    expect(finalRow.p50).toBe(result.endingAssetsPercentiles.p50);
    expect(finalRow.p90).toBe(result.endingAssetsPercentiles.p90);
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
