import { runScenario } from './scenario-engine';
import { Scenario } from '../models/retirement.models';

describe('scenario-engine', () => {
  it('returns a deterministic scenario summary', () => {
    const scenario: Scenario = {
      name: 'Baseline',
      currentAge: 60,
      retirementAge: 60,
      birthYear: 1966,
      ssClaimAge: 67,
      ssPia: 2500,
      lifeExpectancy: 61,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'fixed-amount', amount: 20000 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 0,
    };

    const result = runScenario(scenario, [{ type: 'traditional_401k', balance: 50000, snapshotDate: '2026-01-01' }]);

    // Per year: $20k conversion, taxable $5k after the $15k standard deduction -> $500 tax,
    // withheld from the conversion because there is no brokerage balance to pay it from.
    expect(result.years.length).toBe(2);
    expect(result.totalTax).toBe(1000);
    expect(result.endingAssets).toBe(49000);
  });

  it('smooth-income-target keeps total income flat across the SS claim and RMD years within the bracket', () => {
    const scenario: Scenario = {
      name: 'Income ceiling',
      currentAge: 60,
      retirementAge: 60,
      birthYear: 1966,
      ssClaimAge: 62,
      ssPia: 2800,
      lifeExpectancy: 90,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
      assumedReturnRate: 0.05,
      stateTaxRate: 0.03,
      wageIncome: 0,
      annualLivingExpenses: 0,
    };

    const result = runScenario(scenario, [
      { type: 'traditional_401k', balance: 3000000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 500000, snapshotDate: '2026-01-01' },
    ]);

    const byAge = new Map(result.years.map(y => [y.age, y]));
    const y60 = byAge.get(60)!;
    const y61 = byAge.get(61)!;
    const y62 = byAge.get(62)!;

    // Total income stays flat at the solved ceiling even after Social Security starts...
    expect(y60.conversion).toBeGreaterThan(0);
    expect(y61.taxableIncome).toBe(y60.taxableIncome);
    expect(y62.taxableIncome).toBe(y61.taxableIncome);
    // ...because the conversion drops by exactly the taxable portion of the annual SS benefit ($2,800 * 12 * 0.85).
    expect(y61.conversion - y62.conversion).toBe(28560);

    // Every RMD year lands at or below the target bracket.
    const rmdYears = result.years.filter(y => y.rmd > 0);
    expect(rmdYears.length).toBeGreaterThan(0);
    for (const year of rmdYears) {
      expect(year.marginalRate).toBeLessThanOrEqual(0.24);
    }
  });

  it('withdraws annual living expenses from the brokerage account', () => {
    const scenario: Scenario = {
      name: 'Living expenses',
      currentAge: 60,
      retirementAge: 60,
      birthYear: 1966,
      ssClaimAge: 67,
      ssPia: 0,
      lifeExpectancy: 61,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'none' },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 30000,
    };

    // Zero cost basis: every withdrawn dollar is gain, taxed at 15% federal ($4,500/yr on $30k).
    const allGain = runScenario(scenario, [{ type: 'brokerage', balance: 100000, costBasis: 0, snapshotDate: '2026-01-01' }]);
    expect(allGain.totalTax).toBe(9000);
    expect(allGain.years[0].endingAssets).toBe(65500);
    expect(allGain.endingAssets).toBe(31000);

    // Full cost basis (default when omitted): withdrawals are return of principal, no tax.
    const allPrincipal = runScenario(scenario, [{ type: 'brokerage', balance: 100000, snapshotDate: '2026-01-01' }]);
    expect(allPrincipal.totalTax).toBe(0);
    expect(allPrincipal.endingAssets).toBe(40000);
  });
});
