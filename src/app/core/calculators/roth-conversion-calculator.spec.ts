import { simulateConversionStrategy } from './roth-conversion-calculator';

describe('roth-conversion-calculator', () => {
  it('keeps baseline conversion at zero', () => {
    const [year] = simulateConversionStrategy({
      accounts: [{ type: 'traditional_ira', balance: 100000, snapshotDate: '2026-01-01' }],
      strategy: { mode: 'none' },
      currentAge: 60,
      endAge: 60,
      birthYear: 1966,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0,
    });

    expect(year.conversion).toBe(0);
    expect(year.traditionalBalance).toBe(100000);
  });

  it('fills to the requested bracket ceiling without mutating account input', () => {
    const accounts = [{ type: 'traditional_ira' as const, balance: 100000, snapshotDate: '2026-01-01' }];
    const [year] = simulateConversionStrategy({
      accounts,
      strategy: { mode: 'fill-to-bracket', targetBracket: 0.12 },
      currentAge: 60,
      endAge: 60,
      birthYear: 1966,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0,
    });

    // 12% bracket taxable ceiling ($50,400) + standard deduction ($16,100) with zero base income
    expect(year.conversion).toBe(66500);
    expect(accounts[0].balance).toBe(100000);
  });

  it('floors fractional ages so RMD divisors resolve instead of hitting the age-120 fallback', () => {
    const results = simulateConversionStrategy({
      accounts: [{ type: 'traditional_ira', balance: 1000000, snapshotDate: '2026-01-01' }],
      strategy: { mode: 'none' },
      currentAge: 75.5,
      endAge: 75.9,
      birthYear: 1949,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0,
    });

    expect(results.length).toBe(1);
    expect(results[0].age).toBe(75);
    // Uniform Lifetime divisor for 75 is 24.6 — a fractional age lookup would have
    // fallen through to the age-120 divisor (2.0) and demanded half the balance.
    expect(results[0].rmd).toBe(40650.41);
  });

  it('leaves Social Security untaxed when provisional income is below the threshold', () => {
    const [year] = simulateConversionStrategy({
      accounts: [{ type: 'roth_ira', balance: 500000, snapshotDate: '2026-01-01' }],
      strategy: { mode: 'none' },
      currentAge: 67,
      endAge: 67,
      birthYear: 1959,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0.05,
      retirementAge: 67,
      ssPia: 2000,
      ssClaimAge: 67,
    });

    // $24,000 of SS with no other income: provisional income $12,000 < $25,000 threshold,
    // so nothing is taxable — federally or by the state (SS-exempt).
    expect(year.taxableIncome).toBe(0);
    expect(year.totalTax).toBe(0);
  });

  it('funds living expenses from brokerage when spendingOrder is brokerage-first', () => {
    const [year] = simulateConversionStrategy({
      accounts: [
        { type: 'traditional_ira', balance: 100000, snapshotDate: '2026-01-01' },
        { type: 'brokerage', balance: 50000, snapshotDate: '2026-01-01' },
      ],
      strategy: { mode: 'none' },
      currentAge: 60,
      endAge: 60,
      birthYear: 1966,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0,
      annualLivingExpenses: 20000,
      retirementAge: 60,
      spendingOrder: 'brokerage-first',
    });

    // The low-bracket harvest is skipped: expenses come from brokerage (full basis, no
    // gain, no tax) and the traditional balance is untouched.
    expect(year.taxableIncome).toBe(0);
    expect(year.totalTax).toBe(0);
    expect(year.traditionalBalance).toBe(100000);
    expect(year.brokerageBalance).toBe(30000);
    // The funding sources are reported per year
    expect(year.expensesFromBrokerage).toBe(20000);
    expect(year.expensesFromTraditional).toBe(0);
  });

  it('taxes reinvested dividends annually, stacked through the 0% band, and adds them to basis', () => {
    const base = {
      accounts: [{ type: 'brokerage' as const, balance: 100000, costBasis: 100000, snapshotDate: '2026-01-01' }],
      strategy: { mode: 'none' as const },
      currentAge: 60,
      endAge: 60,
      birthYear: 1966,
      filingStatus: 'single' as const,
      assumedReturnRate: 0,
      stateTaxRate: 0,
      retirementAge: 60,
      dividendYield: 0.02,
    };

    // With no other income, $2,000 of qualified dividends fall in the 0% capital-gains
    // band — no federal tax. Reinvested dividends still raise basis.
    const [year] = simulateConversionStrategy(base);
    expect(year.totalTax).toBe(0);
    expect(year.brokerageBalance).toBe(100000);
    expect(year.brokerageBasis).toBe(100000);

    // With ordinary income past the 0% breakpoint ($49,450 taxable), the same dividends
    // are taxed at 15% = $300. Ordinary tax on the $80k conversion ($63,900 taxable):
    // $1,240 + $4,560 + $13,500 * 22% = $8,770; total $9,070. The payment sale is all
    // basis (no embedded gain), so no further gain is triggered.
    const [highIncomeYear] = simulateConversionStrategy({
      ...base,
      accounts: [
        { type: 'traditional_ira' as const, balance: 1000000, snapshotDate: '2026-01-01' },
        ...base.accounts,
      ],
      strategy: { mode: 'fixed-amount' as const, amount: 80000 },
    });
    expect(highIncomeYear.totalTax).toBe(9070);
  });

  it('sums multiple accounts of the same type instead of keeping only one', () => {
    const [year] = simulateConversionStrategy({
      accounts: [
        { type: 'traditional_401k', balance: 300000, snapshotDate: '2026-01-01' },
        { type: 'traditional_401k', balance: 200000, snapshotDate: '2026-01-01' },
        { type: 'brokerage', balance: 100000, costBasis: 70000, snapshotDate: '2026-01-01' },
        { type: 'brokerage', balance: 50000, costBasis: 40000, snapshotDate: '2026-01-01' },
      ],
      strategy: { mode: 'none' },
      currentAge: 60,
      endAge: 60,
      birthYear: 1966,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0,
    });

    expect(year.traditionalBalance).toBe(500000);
    expect(year.brokerageBalance).toBe(150000);
    expect(year.brokerageBasis).toBe(110000);
  });

  it('funds Roth contributions only from cash left after expenses and taxes', () => {
    const [year] = simulateConversionStrategy({
      accounts: [],
      strategy: { mode: 'none' },
      currentAge: 50,
      endAge: 50,
      birthYear: 1976,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 50000,
      retirementAge: 60,
      annualLivingExpenses: 45000,
      annualRothContribution: 20000,
    });

    // Only $5,000 remains before federal tax. The requested $20,000 Roth contribution
    // must be reduced rather than financed by a withdrawal or reported as new wealth.
    expect(year.federalTax).toBe(3820);
    expect(year.rothBalance).toBe(1180);
    expect(year.shortfall).toBe(0);
  });

  it('accumulates exact pre-tax contributions and match across working years at zero return', () => {
    const years = simulateConversionStrategy({
      accounts: [{ type: 'traditional_401k', balance: 100000, snapshotDate: '2026-01-01' }],
      strategy: { mode: 'none' },
      currentAge: 55,
      endAge: 57,
      birthYear: 1971,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0,
      wageIncome: 20000,
      retirementAge: 58,
      annualPreTaxContribution: 20000,
      employerMatch: 5000,
    });

    expect(years.at(-1)!.traditionalBalance).toBe(175000);
    expect(years.every((year) => year.totalTax === 0)).toBe(true);
  });

  it('inflates working-year living expenses from the current age', () => {
    const years = simulateConversionStrategy({
      accounts: [{ type: 'brokerage', balance: 1000000, costBasis: 1000000, snapshotDate: '2026-01-01' }],
      strategy: { mode: 'none' },
      currentAge: 50,
      endAge: 52,
      birthYear: 1976,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0,
      retirementAge: 60,
      annualLivingExpenses: 50000,
    });

    expect(years.map((year) => year.livingExpenses)).toEqual([50000, 51500, 53045]);
  });

});
