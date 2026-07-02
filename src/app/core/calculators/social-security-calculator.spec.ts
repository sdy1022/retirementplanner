import { compareClaimingAges } from './social-security-calculator';

describe('social-security-calculator', () => {
  it('compares 62, 67, and 70 claiming ages', () => {
    const comparisons = compareClaimingAges(2500, [62, 67, 70], 90, 0);

    expect(comparisons.map((entry) => entry.annualBenefit)).toEqual([21000, 30000, 37200]);
    expect(comparisons.find((entry) => entry.age === 70)?.breakevenAge).toBeGreaterThan(70);
  });
});
