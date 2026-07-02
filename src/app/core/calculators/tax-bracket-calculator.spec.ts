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
});
