import { amountToFillBracket, calculateTax, getMarginalBracket } from './tax-bracket-calculator';

describe('tax-bracket-calculator', () => {
  it('calculates progressive federal tax after the standard deduction', () => {
    expect(calculateTax(75000, 'single', 2026)).toBe(8114);
  });

  it('returns the marginal bracket for taxable income', () => {
    expect(getMarginalBracket(75000, 'single', 2026).rate).toBe(0.22);
  });

  it('calculates room left in a target taxable bracket', () => {
    expect(amountToFillBracket(50000, 48475, 'single', 2026)).toBe(13475);
  });

  it('scales brackets and the standard deduction by the inflation factor', () => {
    // At 3% indexing: deduction $15,450, 10% bracket to $12,282.75, 12% to $49,929.25.
    // Taxable $59,550 -> 1,228.28 + 4,517.58 + (59,550 - 49,929.25) * 0.22 = 7,862.42.
    expect(calculateTax(75000, 'single', 2026, 1.03)).toBe(7862.42);
    // Same income lands one bracket lower than the un-indexed table would place it at higher factors.
    expect(getMarginalBracket(75000, 'single', 2026, 1.3).rate).toBe(0.12);
  });
});
