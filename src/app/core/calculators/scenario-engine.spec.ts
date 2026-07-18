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

  it('pays taxes from a grossed-up traditional withdrawal before touching Roth', () => {
    const scenario: Scenario = {
      name: 'Traditional funds taxes',
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
      annualLivingExpenses: 100000,
    };

    const result = runScenario(scenario, [
      { type: 'traditional_401k', balance: 1000000, snapshotDate: '2026-01-01' },
      { type: 'roth_ira', balance: 500000, snapshotDate: '2026-01-01' },
    ]);

    const year = result.years[0];
    // $100k of expenses comes from traditional (no brokerage, no SS yet); with no
    // brokerage and no conversion to withhold from, the tax on that income is paid
    // by an extra traditional withdrawal grossed up for its own tax — not by Roth.
    expect(year.expensesFromTraditional).toBe(100000);
    expect(year.taxFromRoth).toBe(0);
    expect(year.rothBalance).toBe(500000);
    // The gross-up makes the withdrawal exceed the base tax on $100k ($13,170) and,
    // since it fully funds the year's tax bill, it equals the final total tax.
    expect(year.taxFromTraditional).toBeGreaterThan(13170);
    expect(year.taxFromTraditional).toBe(year.totalTax);
    expect(year.traditionalBalance).toBe(900000 - year.taxFromTraditional);
    expect(year.shortfall).toBe(0);
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
    // ...because the conversion drops by exactly the taxable portion of the annual SS benefit,
    // COLA-indexed from the simulation start: $2,800 * 12 * 1.025^2 * 0.85 = $30,005.85.
    expect(y61.conversion - y62.conversion).toBeCloseTo(30005.85, 2);

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
    // Zero cost basis: every withdrawn dollar is gain — but with no other income the gains
    // stack from $0 of ordinary taxable income, far below the $49,450 single 0% breakpoint,
    // so the federal capital-gains tax is zero (the retiree harvests gains in the 0% band).
    const allGain = runScenario(scenario, [{ type: 'brokerage', balance: 100000, costBasis: 0, snapshotDate: '2026-01-01' }]);
    expect(allGain.totalTax).toBe(0);
    expect(allGain.years[0].endingAssets).toBe(70000);
    expect(allGain.endingAssets).toBe(39100);

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
    // At 65, the surcharge is driven by age-63 MAGI ($200k, single) against the year-65
    // thresholds, inflated 3%/yr for two years: the $171k tier becomes $181,414 (crossed)
    // and $205k becomes $217,485 (not crossed) -> $385.00/mo * 1.0609 * 12 = $4,901.36.
    expect(byAge.get(65)!.irmaa).toBe(4901.36);
  });

  it('passes working-year contributions through runScenario to the engine', () => {
    // Regression test: the Scenario Builder collected the four contribution fields and the
    // engine supported them, but runScenario's pass-through list dropped them — so the
    // dashboard and Monte Carlo silently ignored every 401k/Roth/brokerage contribution.
    // Only engine-direct tests existed, which is why the gap went unnoticed.
    const scenario: Scenario = {
      name: 'Contributions',
      currentAge: 55,
      retirementAge: 56,
      birthYear: 1971,
      ssClaimAge: 67,
      ssPia: 0,
      lifeExpectancy: 55,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'none' },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 100000,
      annualLivingExpenses: 30000,
      annualPreTaxContribution: 20000,
      annualRothContribution: 10000,
      annualBrokerageContribution: 10000,
      employerMatch: 5000,
    };
    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 100000, snapshotDate: '2026-01-01' },
      { type: 'roth_ira', balance: 50000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 50000, costBasis: 50000, snapshotDate: '2026-01-01' },
    ]);
    const [year] = result.years;
    // Pre-tax contribution reduces taxable wages: $100k - $20k = $80k -> $8,770 federal.
    expect(year.taxableIncome).toBe(80000);
    expect(year.federalTax).toBe(8770);
    // Traditional grows by employee pre-tax + match; Roth by the Roth contribution.
    expect(year.traditionalBalance).toBe(125000); // 100k + 20k + 5k
    expect(year.rothBalance).toBe(60000); // 50k + 10k
    // Brokerage grows by its contribution plus the unspent wage cash after expenses,
    // contributions, and taxes: 100k - 30k - 40k = 30k gross, minus 8,770 tax = 21,230.
    expect(year.brokerageBalance).toBe(81230); // 50k + 10k + 21,230
  });

  it('applies Social Security COLA from the simulation start (and freezes at ssColaRate 0)', () => {
    const scenario: Scenario = {
      name: 'SS COLA',
      currentAge: 62,
      retirementAge: 62,
      birthYear: 1964,
      ssClaimAge: 62,
      ssPia: 1000,
      lifeExpectancy: 64,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'none' },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 50000,
      ssColaRate: 0.02,
    };
    const accounts = [{ type: 'brokerage' as const, balance: 500000, snapshotDate: '2026-01-01' }];

    const result = runScenario(scenario, accounts);
    const byAge = new Map(result.years.map(y => [y.age, y]));
    expect(byAge.get(62)!.expensesFromSs).toBe(12000);
    expect(byAge.get(63)!.expensesFromSs).toBe(12240); // 12,000 * 1.02
    expect(byAge.get(64)!.expensesFromSs).toBeCloseTo(12484.8, 2); // 12,000 * 1.02^2

    const frozen = runScenario({ ...scenario, ssColaRate: 0 }, accounts);
    expect(frozen.years.every(y => y.expensesFromSs === 12000)).toBe(true);
  });

  it('applies the 65+ senior deductions (additional standard deduction + OBBBA bonus) to federal tax', () => {
    const scenario: Scenario = {
      name: 'Senior deduction',
      currentAge: 64,
      retirementAge: 64,
      birthYear: 1962,
      ssClaimAge: 70,
      ssPia: 0,
      lifeExpectancy: 65,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'fixed-amount', amount: 100000 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 0,
    };
    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 1000000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 500000, costBasis: 500000, snapshotDate: '2026-01-01' },
    ]);
    const byAge = new Map(result.years.map(y => [y.age, y]));
    // Age 64 (2026): no senior deduction. $100k conversion less the $16,100 standard
    // deduction -> $13,170 federal tax.
    expect(byAge.get(64)!.federalTax).toBe(13170);
    // Age 65 (2027): the additional standard deduction ($2,050 * 1.03) plus the OBBBA bonus
    // ($6,000 less the 6% phaseout above $75k MAGI = $4,500) shave $6,611.50 off ordinary
    // income -> $11,450.57, vs $12,905.10 from bracket indexing alone.
    expect(byAge.get(65)!.federalTax).toBe(11450.57);
  });

  it('grosses up brokerage sales that pay conversion taxes for the gains they realize', () => {
    const scenario: Scenario = {
      name: 'Payment-sale gains',
      currentAge: 64,
      retirementAge: 64,
      birthYear: 1962,
      ssClaimAge: 70,
      ssPia: 0,
      lifeExpectancy: 64,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'fixed-amount', amount: 100000 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 0,
    };
    // Zero-basis brokerage: every dollar sold to pay the conversion tax is itself a gain,
    // taxed at 15% (the $100k conversion fills the 0% band). The sale must gross itself
    // up: sale = $13,170 / (1 - 0.15) = $15,494.12.
    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 1000000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 500000, costBasis: 0, snapshotDate: '2026-01-01' },
    ]);
    const [year] = result.years;
    expect(year.federalTax).toBe(15494.12);
    expect(year.taxFromBrokerage).toBe(15494.12);
    expect(year.brokerageBalance).toBe(484505.88);
    expect(year.shortfall).toBe(0);
  });

  it('charges the 10% early-distribution penalty on pre-59.5 traditional withdrawals', () => {
    const scenario: Scenario = {
      name: 'Early retiree',
      currentAge: 55,
      retirementAge: 55,
      birthYear: 1971,
      ssClaimAge: 67,
      ssPia: 0,
      lifeExpectancy: 55,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'none' },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 20000,
    };
    const result = runScenario(scenario, [{ type: 'traditional_ira', balance: 100000, snapshotDate: '2026-01-01' }]);
    const [year] = result.years;
    // $20k of expenses from traditional at 55: $390 ordinary tax + $2,000 penalty. With no
    // brokerage, the tax is paid by another traditional withdrawal, grossed up for its own
    // tax AND its own penalty (both in the 10% bracket): w = 2,390 + 0.2w -> $2,987.50.
    expect(year.federalTax).toBe(2987.5);
    expect(year.earlyWithdrawalPenalty).toBe(2298.75); // 2,000 + 10% of the 2,987.50 gross-up
    expect(year.traditionalBalance).toBe(77012.5);
    expect(year.shortfall).toBe(0);
  });

  it('uses preSimulationMagi for the IRMAA lookback when the plan starts at Medicare age', () => {
    const scenario: Scenario = {
      name: 'IRMAA pre-sim MAGI',
      currentAge: 65,
      retirementAge: 65,
      birthYear: 1961,
      ssClaimAge: 70,
      ssPia: 0,
      lifeExpectancy: 65,
      filingStatus: 'single',
      rothConversionStrategy: { mode: 'fixed-amount', amount: 200000 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 0,
    };
    const accounts = [
      { type: 'traditional_ira' as const, balance: 1000000, snapshotDate: '2026-01-01' },
      { type: 'brokerage' as const, balance: 500000, costBasis: 500000, snapshotDate: '2026-01-01' },
    ];
    // Without pre-sim MAGI the fallback wrongly judges age-65 IRMAA by the age-65
    // conversion income ($200k -> tier 3); with the real two-years-ago income ($50k,
    // below every threshold) the first Medicare year owes no surcharge.
    const withoutHistory = runScenario(scenario, accounts);
    expect(withoutHistory.years[0].irmaa).toBeGreaterThan(0);
    const withHistory = runScenario({ ...scenario, preSimulationMagi: 50000 }, accounts);
    expect(withHistory.years[0].irmaa).toBe(0);
  });

  it('survivor keeps the larger SS benefit and moves to single filing after the spouse dies', () => {
    const scenario: Scenario = {
      name: 'Survivor',
      currentAge: 67,
      retirementAge: 67,
      birthYear: 1959,
      ssClaimAge: 67,
      ssPia: 2000,
      ssColaRate: 0,
      lifeExpectancy: 75,
      filingStatus: 'married_filing_jointly',
      rothConversionStrategy: { mode: 'none' },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 60000,
      spouseCurrentAge: 67,
      spouseLifeExpectancy: 70,
      spouseSsPia: 1000,
      spouseSsClaimAge: 67,
    };
    const result = runScenario(scenario, [{ type: 'brokerage', balance: 2000000, snapshotDate: '2026-01-01' }]);
    const byAge = new Map(result.years.map(y => [y.age, y]));
    // Both alive (through the spouse's final year at 70): benefits add ($2,000 + $1,000) * 12
    expect(byAge.get(67)!.expensesFromSs).toBe(36000);
    expect(byAge.get(70)!.expensesFromSs).toBe(36000);
    // Survivor keeps the larger benefit only
    expect(byAge.get(71)!.expensesFromSs).toBe(24000);
    expect(byAge.get(75)!.expensesFromSs).toBe(24000);
  });

  it('widow\'s tax penalty: the same income is taxed in higher brackets after the spouse dies', () => {
    const scenario: Scenario = {
      name: 'Widow penalty',
      currentAge: 70,
      retirementAge: 70,
      birthYear: 1956,
      ssClaimAge: 70,
      ssPia: 0,
      lifeExpectancy: 73,
      filingStatus: 'married_filing_jointly',
      rothConversionStrategy: { mode: 'fixed-amount', amount: 100000 },
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 0,
      annualLivingExpenses: 0,
      spouseCurrentAge: 70,
      spouseLifeExpectancy: 71,
    };
    const result = runScenario(scenario, [
      { type: 'traditional_ira', balance: 2000000, snapshotDate: '2026-01-01' },
      { type: 'brokerage', balance: 1000000, costBasis: 1000000, snapshotDate: '2026-01-01' },
    ]);
    const byAge = new Map(result.years.map(y => [y.age, y]));
    // The same $100k conversion sits in the 12% bracket on a joint return, but lands in
    // the 22% bracket on the survivor's single return from age 72 on
    expect(byAge.get(70)!.marginalRate).toBe(0.12);
    expect(byAge.get(71)!.marginalRate).toBe(0.12); // spouse's final (joint) year
    expect(byAge.get(72)!.marginalRate).toBe(0.22);
    expect(byAge.get(72)!.federalTax).toBeGreaterThan(byAge.get(71)!.federalTax);
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
    // With explicit cash-flow modeling, wages no longer automatically "cover their own taxes."
    // All income generates tax, which is paid from unspent cash flow before reducing the portfolio.
    // 80k wage + 38,350 conversion = 118,350 gross. Minus 16,100 single deduction = 102,250 taxable.
    // Federal tax on 102,250 is $17,207 according to 2026 tax tables.
    // Unspent wage cash ($80k) pays the $17,207 tax, leaving $62,793 to deposit into brokerage!
    expect(year.federalTax).toBe(17207);
    expect(year.brokerageBalance).toBe(162793);
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
    // Assets accumulate the unspent $80k wage (less $8,770 base tax = $71,230) -> 671230
    expect(result.endingAssets).toBe(671230);
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
