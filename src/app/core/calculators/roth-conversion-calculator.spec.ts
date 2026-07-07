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

  it('taxes reinvested dividends annually and adds them to cost basis', () => {
    const [year] = simulateConversionStrategy({
      accounts: [{ type: 'brokerage', balance: 100000, costBasis: 100000, snapshotDate: '2026-01-01' }],
      strategy: { mode: 'none' },
      currentAge: 60,
      endAge: 60,
      birthYear: 1966,
      filingStatus: 'single',
      assumedReturnRate: 0,
      stateTaxRate: 0,
      retirementAge: 60,
      dividendYield: 0.02,
    });

    // $2,000 of dividends taxed at 15% = $300, paid from brokerage; the reinvested
    // dividends raise basis, capped at the remaining balance.
    expect(year.totalTax).toBe(300);
    expect(year.brokerageBalance).toBe(99700);
    expect(year.brokerageBasis).toBe(99700);
  });
});
