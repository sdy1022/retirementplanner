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

  it('the adaptive-spending guardrail raises success probability for a marginal plan', () => {
    // A *marginal* plan — meaningful failure risk, but not so deep a hole that a 10% trim
    // can't flip outcomes. (A deeply underfunded plan fails with or without the guardrail;
    // measured at 5,000 trials this shape gains ~7 points, 68% -> 75%.)
    const marginalScenario: Scenario = { ...wellFundedScenario, annualLivingExpenses: 70000 };
    const marginalAccounts = [
      { type: 'traditional_401k' as const, balance: 1400000, snapshotDate: '2026-01-01' },
      { type: 'brokerage' as const, balance: 300000, snapshotDate: '2026-01-01' },
    ];

    const withoutGuardrail = runMonteCarloSmoothIncomeTarget(marginalScenario, marginalAccounts, 1500, 11, false);
    const withGuardrail = runMonteCarloSmoothIncomeTarget(marginalScenario, marginalAccounts, 1500, 11, true);

    // Cutting spending and pausing conversions when behind should measurably help, not just tie
    expect(withGuardrail.successProbability).toBeGreaterThan(withoutGuardrail.successProbability);
  });

  it('passes working-year contributions through to the trials (regression for the dropped pass-through)', () => {
    // Same seed, same market paths — the only difference is $30k/yr of pre-tax
    // contributions plus a $5k match during five working years, which must leave the
    // trials richer. Failed silently before the contribution fields were added to
    // createTrialRunner's pass-through list.
    const workingScenario: Scenario = {
      ...wellFundedScenario,
      currentAge: 55,
      retirementAge: 60,
      wageIncome: 150000,
      annualLivingExpenses: 40000,
    };
    const without = runMonteCarloSmoothIncomeTarget(workingScenario, wellFundedAccounts, 100, 31, false);
    const withContrib = runMonteCarloSmoothIncomeTarget(
      { ...workingScenario, annualPreTaxContribution: 30000, employerMatch: 5000 },
      wellFundedAccounts,
      100,
      31,
      false,
    );
    expect(withContrib.meanEndingAssets).toBeGreaterThan(without.meanEndingAssets);
  });

  it('the guardrail is a no-op for a comfortably funded plan (rarely enters cut mode, so results are close)', () => {
    const without = runMonteCarloSmoothIncomeTarget(wellFundedScenario, wellFundedAccounts, 500, 21, false);
    const withG = runMonteCarloSmoothIncomeTarget(wellFundedScenario, wellFundedAccounts, 500, 21, true);
    expect(withG.successProbability).toBeGreaterThanOrEqual(without.successProbability);
  });

  it('reports guardrailStats only when the guardrail was used, and it reflects real trigger activity for a marginal plan', () => {
    const marginalScenario: Scenario = { ...wellFundedScenario, annualLivingExpenses: 70000 };
    const marginalAccounts = [
      { type: 'traditional_401k' as const, balance: 1400000, snapshotDate: '2026-01-01' },
      { type: 'brokerage' as const, balance: 300000, snapshotDate: '2026-01-01' },
    ];

    const without = runMonteCarloSmoothIncomeTarget(marginalScenario, marginalAccounts, 500, 11, false);
    expect(without.guardrailStats).toBeUndefined();

    const withG = runMonteCarloSmoothIncomeTarget(marginalScenario, marginalAccounts, 500, 11, true);
    expect(withG.guardrailStats).toBeDefined();
    expect(withG.guardrailStats!.triggeredProbability).toBeGreaterThan(0);
    expect(withG.guardrailStats!.triggeredProbability).toBeLessThanOrEqual(1);
    expect(withG.guardrailStats!.medianYearsInCutMode).toBeGreaterThan(0);
    expect(withG.guardrailStats!.p90YearsInCutMode).toBeGreaterThanOrEqual(withG.guardrailStats!.medianYearsInCutMode);
  });

  it('reports failureStats with a positive median shortfall when some trials fail, and omits it when none do', () => {
    // Overfunded well past any plausible bad-market path, so every trial should succeed.
    const overfundedAccounts = [
      { type: 'traditional_401k' as const, balance: 20000000, snapshotDate: '2026-01-01' },
      { type: 'brokerage' as const, balance: 5000000, snapshotDate: '2026-01-01' },
    ];
    const overfunded = runMonteCarloSmoothIncomeTarget(wellFundedScenario, overfundedAccounts, 500, 7);
    expect(overfunded.successProbability).toBe(1);
    expect(overfunded.failureStats).toBeUndefined();

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
    expect(thin.successProbability).toBeLessThan(1);
    expect(thin.failureStats).toBeDefined();
    expect(thin.failureStats!.medianShortfall).toBeGreaterThan(0);
    expect(thin.failureStats!.p90Shortfall).toBeGreaterThanOrEqual(thin.failureStats!.medianShortfall);
  });
});
