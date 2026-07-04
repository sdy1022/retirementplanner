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

    // 12% bracket taxable ceiling ($48,475) + standard deduction ($15,000) with zero base income
    expect(year.conversion).toBe(63475);
    expect(accounts[0].balance).toBe(100000);
  });
});
