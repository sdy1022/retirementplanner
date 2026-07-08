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

    // Year one: $20k conversion, taxable $3.9k after the $16.1k standard deduction -> $390 tax,
    // withheld from the conversion because there is no brokerage balance to pay it from.
    // Year two: the deduction indexes 3% to $16,583, so taxable is $3,417 -> $341.70 tax.
    expect(result.years.length).toBe(2);
    expect(result.totalTax).toBe(731.7);
    expect(result.endingAssets).toBe(49268.3);
    // No brokerage exists, so the tax is withheld from the conversion itself
    expect(result.years[0].taxWithheldFromConversion).toBe(390);
    expect(result.years[0].taxFromBrokerage).toBe(0);
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
    // not brokerage: $3.9k taxable after the $16.1k standard deduction -> $390 federal tax.
    expect(year.taxableIncome).toBe(20000);
    expect(year.totalTax).toBe(390);
    expect(year.traditionalBalance).toBe(80000);
    expect(year.brokerageBalance).toBe(9610); // untouched except paying the tax
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
    // above the $171k tier but not above $205k -> $385.00/mo * 12 = $4,620.
    expect(byAge.get(65)!.irmaa).toBe(4620);
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

  it('converts during working years up to the target income above wages when allowed', () => {
    const scenario: Scenario = {
      name: 'Pre-retirement conversion',
      currentAge: 53,
      retirementAge: 60,
      birthYear: 1973,
      ssClaimAge: 67,
      ssPia: 0,
      lifeExpectancy: 53,
      filingStatus: 'single',
      // Income target below the 22% gross ceiling ($105,700 taxable + $16,100 deduction)
      rothConversionStrategy: { mode: 'fill-to-income', targetIncome: 118350 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 80000,
      annualLivingExpenses: 0,
      allowPreRetirementConversions: true,
    };

    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 500000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 100000, snapshotDate: '2026-01-01' },
    ]);

    const [year] = result.years;
    // Conversion fills the room above wages: $118,350 - $80,000.
    expect(year.conversion).toBe(38350);
    // The plan pays only the incremental tax the conversion causes on top of wages —
    // the full $38,350 sits inside the 22% bracket: 0.22 * 38,350 = $8,437 from brokerage.
    expect(year.federalTax).toBe(8437);
    expect(year.brokerageBalance).toBe(91563);
    expect(year.rothBalance).toBe(38350);
    expect(year.traditionalBalance).toBe(461650);
    // The engine explains why the raw ending balance looks smaller than without conversions.
    expect(result.note).toContain('after future taxes');
  });

  it('auto-disables working-year conversions when they lose after tax', () => {
    const scenario: Scenario = {
      name: 'Conversions not worth it',
      currentAge: 53,
      retirementAge: 60,
      birthYear: 1973,
      ssClaimAge: 67,
      ssPia: 0,
      lifeExpectancy: 53,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'fill-to-income', targetIncome: 118350 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 80000,
      annualLivingExpenses: 0,
      allowPreRetirementConversions: true,
      // Residual rate 0 means traditional dollars count at full value, so paying 22%
      // conversion tax up front can only lose; the engine should pick the gated run.
      residualTaxRate: 0,
    };

    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 500000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 100000, snapshotDate: '2026-01-01' },
    ]);

    expect(result.years[0].conversion).toBe(0);
    expect(result.endingAssets).toBe(600000);
    expect(result.note).toContain('skipped automatically');
  });

  it('grows wages by the annual raise, shrinking working-year conversion room', () => {
    const scenario: Scenario = {
      name: 'MFJ with raises',
      currentAge: 53,
      retirementAge: 60,
      birthYear: 1973,
      ssClaimAge: 67,
      ssPia: 0,
      lifeExpectancy: 54,
      filingStatus: 'married_filing_jointly',
      // Income target near the 22% MFJ gross ceiling ($211,400 taxable + $32,200 deduction)
      rothConversionStrategy: { mode: 'fill-to-income', targetIncome: 236700 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 180000,
      annualLivingExpenses: 0,
      allowPreRetirementConversions: true,
      annualWageGrowth: 5000,
    };

    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 800000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 200000, snapshotDate: '2026-01-01' },
    ]);

    const [y53, y54] = result.years;
    // Year one: $236,700 target - $180,000 wages leaves $56,700 of room.
    expect(y53.conversion).toBe(56700);
    expect(y53.taxableIncome).toBe(236700);
    // Year two: wages rise to $185,000, so the room shrinks to $51,700.
    expect(y54.conversion).toBe(51700);
    expect(y54.taxableIncome).toBe(236700);
  });

  it('smooth-income-target uses working years when pre-retirement conversions are allowed', () => {
    const scenario: Scenario = {
      name: 'Working-year 22% fill',
      currentAge: 53,
      retirementAge: 60,
      birthYear: 1973,
      ssClaimAge: 67,
      ssPia: 2000,
      lifeExpectancy: 90,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'smooth-income-target', targetBracket: 0.22 },
      assumedReturnRate: 0.05,
      stateTaxRate: 0,
      wageIncome: 80000,
      annualLivingExpenses: 0,
      allowPreRetirementConversions: true,
    };

    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 1500000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 400000, snapshotDate: '2026-01-01' },
    ]);

    // Working years (53-59) convert into the room above wages instead of sitting idle.
    const workingYears = result.years.filter(y => y.age < 60);
    expect(workingYears.some(y => y.conversion > 0)).toBeTrue();

    // Without the flag, working years convert nothing and end with less after-tax wealth.
    const gated = runScenario({ ...scenario, allowPreRetirementConversions: false }, [
      { type: 'traditional_ira', balance: 1500000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 400000, snapshotDate: '2026-01-01' },
    ]);
    expect(gated.years.filter(y => y.age < 60).every(y => y.conversion === 0)).toBeTrue();
  });

  it('brokerage gains tax rate flips the expense funding order', () => {
    const scenario: Scenario = {
      name: 'Funding order',
      currentAge: 60,
      retirementAge: 60,
      birthYear: 1966,
      ssClaimAge: 67,
      ssPia: 0,
      lifeExpectancy: 60,
      filingStatus: 'single',
      // Income target below the 12% gross ceiling ($50,400 taxable + $16,100 deduction)
      rothConversionStrategy: { mode: 'fill-to-income', targetIncome: 63475 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 30000,
    };
    const accounts = () => [
      { type: 'traditional_ira' as const, balance: 200000, snapshotDate: '2026-01-01' },
      { type: 'brokerage' as const, balance: 100000, costBasis: 50000, snapshotDate: '2026-01-01' },
    ];

    // Gains untaxed at the end (step-up assumption): IRA-first wins because
    // brokerage-first's realized-gains tax is charged but its benefit never scores.
    const stepUp = runScenario(scenario, accounts());
    expect(stepUp.years[0].rothBalance).toBe(33475); // conversion tops off above the $30k withdrawal
    expect(stepUp.note).toBeUndefined();

    // Ending gains taxed at 15%: brokerage-first wins — spending brokerage shrinks the
    // taxable gain pile while the full bracket room converts to Roth.
    const spender = runScenario({ ...scenario, brokerageGainsTaxRate: 0.15 }, accounts());
    expect(spender.years[0].rothBalance).toBe(63475); // full room converted
    expect(spender.note).toContain('brokerage first');
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

  describe('SBLOC tax funding (buy-borrow-die)', () => {
    const scenario: Scenario = {
      name: 'SBLOC taxes',
      currentAge: 60,
      retirementAge: 60,
      birthYear: 1966,
      ssClaimAge: 67,
      ssPia: 0,
      lifeExpectancy: 61,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'fixed-amount', amount: 20000 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 0,
      sblocTaxFunding: { startAge: 60, endAge: 75, borrowRate: 0.07, maxLtv: 0.4 },
    };

    it('borrows the conversion tax, compounds interest, and leaves the brokerage untouched', () => {
      const result = runScenario(scenario, [
        { type: 'traditional_401k', balance: 50000, snapshotDate: '2026-01-01' },
        { type: 'brokerage', balance: 100000, snapshotDate: '2026-01-01' },
      ]);

      // Year one: $390 conversion tax drawn on the line, none from brokerage.
      expect(result.years[0].taxFromSbloc).toBe(390);
      expect(result.years[0].taxFromBrokerage).toBe(0);
      expect(result.years[0].sblocLoanBalance).toBe(390);
      // Year two: 7% interest on $390, plus the $341.70 tax on the second conversion.
      expect(result.years[1].sblocInterest).toBe(27.3);
      expect(result.years[1].sblocLoanBalance).toBe(759);
      // The brokerage never sold a share to pay conversion taxes.
      expect(result.years[1].brokerageBalance).toBe(100000);
      // endingAssets stays gross; the loan is reported separately for net-estate math.
      expect(result.endingAssets).toBe(150000);
    });

    it('caps draws at maxLtv of the brokerage collateral and pays the excess in cash', () => {
      const result = runScenario({ ...scenario, lifeExpectancy: 60 }, [
        { type: 'traditional_401k', balance: 50000, snapshotDate: '2026-01-01' },
        { type: 'brokerage', balance: 500, snapshotDate: '2026-01-01' },
      ]);

      // $390 of conversion tax, but 40% of $500 collateral only allows a $200 draw.
      expect(result.years[0].taxFromSbloc).toBe(200);
      expect(result.years[0].taxFromBrokerage).toBe(190);
      // Paying the $190 cash tax shrank the collateral to $310, so the $200 loan breached
      // the cap and was cured down: repay 76 / (1 − 0.4) = $126.67 from brokerage, leaving
      // a $73.33 loan against $183.33 of collateral — exactly 40%.
      expect(result.years[0].sblocPaydown).toBe(126.67);
      expect(result.years[0].sblocLoanBalance).toBe(73.33);
    });

    it('force-pays the loan down from cash when spending erodes the collateral', () => {
      const result = runScenario({ ...scenario, annualLivingExpenses: 1500, spendingOrder: 'brokerage-first' }, [
        { type: 'traditional_401k', balance: 100000, snapshotDate: '2026-01-01' },
        { type: 'brokerage', balance: 2000, snapshotDate: '2026-01-01' },
      ]);

      // Year one: expenses leave $500 of collateral, draw capped at $200, then the cash tax
      // payment shrinks collateral further and the cure pays the loan down to $73.33.
      expect(result.years[0].taxFromSbloc).toBe(200);
      expect(result.years[0].sblocPaydown).toBe(126.67);
      expect(result.years[0].sblocLoanBalance).toBe(73.33);
      // Year two: expenses consume the rest of the brokerage, so no collateral remains —
      // the loan (plus 7% interest) is fully repaid from the Roth backstop and BBD ends.
      expect(result.years[1].brokerageBalance).toBe(0);
      expect(result.years[1].taxFromSbloc).toBe(0);
      expect(result.years[1].sblocInterest).toBe(5.13);
      expect(result.years[1].sblocPaydown).toBe(78.46);
      expect(result.years[1].sblocLoanBalance).toBe(0);
    });

    it('stops borrowing after the window but keeps accruing interest on the loan', () => {
      const result = runScenario({ ...scenario, sblocTaxFunding: { startAge: 60, endAge: 60, borrowRate: 0.07 } }, [
        { type: 'traditional_401k', balance: 50000, snapshotDate: '2026-01-01' },
        { type: 'brokerage', balance: 100000, snapshotDate: '2026-01-01' },
      ]);

      // Age 61 is outside the window: tax reverts to the brokerage waterfall,
      // while the age-60 loan still compounds at 7%.
      expect(result.years[1].taxFromSbloc).toBe(0);
      expect(result.years[1].taxFromBrokerage).toBe(341.7);
      expect(result.years[1].sblocLoanBalance).toBe(417.3);
    });
  });
});
