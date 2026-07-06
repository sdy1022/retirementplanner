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

    // Expenses inflate 3%/yr after retirement: $30,000 in year one, $30,900 in year two.
    // Zero cost basis: every withdrawn dollar is gain, taxed at 15% federal.
    const allGain = runScenario(scenario, [{ type: 'brokerage', balance: 100000, costBasis: 0, snapshotDate: '2026-01-01' }]);
    expect(allGain.totalTax).toBe(9135); // 4500 + 4635
    expect(allGain.years[0].endingAssets).toBe(65500);
    expect(allGain.endingAssets).toBe(29965);

    // Full cost basis (default when omitted): withdrawals are return of principal, no tax.
    const allPrincipal = runScenario(scenario, [{ type: 'brokerage', balance: 100000, snapshotDate: '2026-01-01' }]);
    expect(allPrincipal.totalTax).toBe(0);
    expect(allPrincipal.endingAssets).toBe(39100);
  });

  it('funds living expenses from traditional through the low brackets before touching brokerage', () => {
    const scenario: Scenario = {
      name: 'Low bracket harvest',
      currentAge: 60,
      retirementAge: 60,
      birthYear: 1966,
      ssClaimAge: 67,
      ssPia: 0,
      lifeExpectancy: 60,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'none' },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 20000,
    };

    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 100000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 10000, costBasis: 10000, snapshotDate: '2026-01-01' },
    ]);

    const [year] = result.years;
    // The $20k expense fits in the 12% low-bracket space, so it comes from traditional,
    // not brokerage: $5k taxable after the $15k standard deduction -> $500 federal tax.
    expect(year.taxableIncome).toBe(20000);
    expect(year.totalTax).toBe(500);
    expect(year.traditionalBalance).toBe(80000);
    expect(year.brokerageBalance).toBe(9500); // untouched except paying the tax
  });

  it('charges Medicare IRMAA from 65 based on MAGI two years prior', () => {
    const scenario: Scenario = {
      name: 'IRMAA lookback',
      currentAge: 63,
      retirementAge: 63,
      birthYear: 1963,
      ssClaimAge: 70,
      ssPia: 0,
      lifeExpectancy: 66,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'fixed-amount', amount: 200000 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 0,
    };

    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 3000000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 500000, costBasis: 500000, snapshotDate: '2026-01-01' },
    ]);

    const byAge = new Map(result.years.map(y => [y.age, y]));
    // No Medicare before 65.
    expect(byAge.get(63)!.irmaa).toBe(0);
    expect(byAge.get(64)!.irmaa).toBe(0);
    // At 65, the surcharge is driven by age-63 MAGI ($200k, single):
    // above the $167k tier but not above $200k -> $352.90/mo * 12 = $4,234.80.
    expect(byAge.get(65)!.irmaa).toBe(4234.8);
  });

  it('fill-to-income keeps converting past RMD age until conversionStopAge', () => {
    const scenario: Scenario = {
      name: 'Post-RMD top-off',
      currentAge: 74,
      retirementAge: 74,
      birthYear: 1962, // RMD start age 75 under SECURE 2.0
      ssClaimAge: 70,
      ssPia: 0,
      lifeExpectancy: 78,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'fill-to-income', targetIncome: 100000, stopAtRmdAge: false, conversionStopAge: 77 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 0,
    };

    const result = runScenario(scenario, [{ type: 'traditional_ira', balance: 1000000, snapshotDate: '2026-01-01' }]);
    const byAge = new Map(result.years.map(y => [y.age, y]));

    // Before RMDs the conversion fills straight to the income target.
    expect(byAge.get(74)!.conversion).toBe(100000);
    // In RMD years the conversion only tops off the remaining room above the RMD.
    const y75 = byAge.get(75)!;
    expect(y75.rmd).toBeGreaterThan(0);
    expect(y75.conversion).toBe(100000 - y75.rmd);
    // From conversionStopAge on, conversions cease while RMDs continue.
    expect(byAge.get(77)!.conversion).toBe(0);
    expect(byAge.get(77)!.rmd).toBeGreaterThan(0);
  });

  it('smooth-income-target tops off the bracket in RMD years when the residual tax rate makes it worthwhile', () => {
    const scenario: Scenario = {
      name: 'Post-RMD optimizer',
      currentAge: 70,
      retirementAge: 70,
      birthYear: 1962,
      ssClaimAge: 70,
      ssPia: 0,
      lifeExpectancy: 90,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.24 },
      assumedReturnRate: 0.05,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 0,
      // Traditional dollars left behind are assumed to be liquidated at 50%,
      // so converting at 24% during RMD years is clearly better than stopping.
      residualTaxRate: 0.5,
    };

    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 2000000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 1000000, snapshotDate: '2026-01-01' },
    ]);

    const rmdYears = result.years.filter(y => y.age >= 75);
    // At least the early RMD years keep converting on top of the RMD...
    expect(rmdYears.some(y => y.conversion > 0)).toBeTrue();
    // ...without ever spilling past the target bracket.
    for (const year of rmdYears) {
      expect(year.marginalRate).toBeLessThanOrEqual(0.24);
    }
  });

  it('reports a shortfall when no account can fund the year', () => {
    const scenario: Scenario = {
      name: 'Underfunded',
      currentAge: 60,
      retirementAge: 60,
      birthYear: 1966,
      ssClaimAge: 70,
      ssPia: 0,
      lifeExpectancy: 60,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'none' },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 50000,
    };

    const result = runScenario(scenario, [{ type: 'brokerage', balance: 20000, snapshotDate: '2026-01-01' }]);

    // $50k of expenses against $20k of total assets: $30k has no funding source.
    expect(result.years[0].shortfall).toBe(30000);
    expect(result.years[0].endingAssets).toBe(0);
  });
});
