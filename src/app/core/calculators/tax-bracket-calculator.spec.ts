import { amountToFillBracket, calculateTax, getMarginalBracket } from './tax-bracket-calculator';

describe('tax-bracket-calculator', () => {
  it('calculates progressive federal tax after the standard deduction', () => {
    // 2026 single: $16,100 deduction -> $58,900 taxable
    // 1,240 + (50,400 - 12,400) * 0.12 + (58,900 - 50,400) * 0.22 = 7,670
    expect(calculateTax(75000, 'single', 2026)).toBe(7670);
  });

  it('returns the marginal bracket for taxable income', () => {
    expect(getMarginalBracket(75000, 'single', 2026).rate).toBe(0.22);
  });

  it('calculates room left in a target taxable bracket', () => {
    // 12% bracket top $50,400 + $16,100 deduction - $50,000 gross = $16,500
    expect(amountToFillBracket(50000, 50400, 'single', 2026)).toBe(16500);
  });

  it('scales brackets and the standard deduction by the inflation factor', () => {
    // At 3% indexing: deduction $16,583, 10% bracket to $12,772, 12% to $51,912.
    // Taxable $58,417 -> 1,277.20 + 4,696.80 + (58,417 - 51,912) * 0.22 = 7,405.10.
    expect(calculateTax(75000, 'single', 2026, 1.03)).toBe(7405.1);
    // Same income lands one bracket lower than the un-indexed table would place it at higher factors.
    expect(getMarginalBracket(75000, 'single', 2026, 1.3).rate).toBe(0.12);
  });
});
