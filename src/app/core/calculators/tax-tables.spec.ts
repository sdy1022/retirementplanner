import { irmaaAnnualSurcharge, seniorDeduction } from './tax-tables';

describe('tax-tables', () => {
  describe('seniorDeduction', () => {
    it('is zero before age 65', () => {
      expect(seniorDeduction(64, 'single', 2026, 50000)).toBe(0);
    });

    it('single 65+ with low MAGI gets the additional deduction plus the full OBBBA bonus', () => {
      expect(seniorDeduction(65, 'single', 2026, 50000)).toBe(2050 + 6000);
    });

    it('phases the OBBBA bonus out at 6% of MAGI above $75k (single)', () => {
      // $25k over the threshold -> $1,500 reduction -> $4,500 bonus remains
      expect(seniorDeduction(65, 'single', 2026, 100000)).toBe(2050 + 4500);
    });

    it('keeps the additional deduction after the OBBBA bonus fully phases out', () => {
      expect(seniorDeduction(65, 'single', 2026, 200000)).toBe(2050);
    });

    it('MFJ counts two qualifying spouses (both assumed 65+)', () => {
      expect(seniorDeduction(65, 'married_filing_jointly', 2026, 100000)).toBe(1650 * 2 + 12000);
    });

    it('drops the OBBBA bonus after tax year 2028', () => {
      expect(seniorDeduction(65, 'single', 2028, 50000)).toBe(2050 + 6000);
      expect(seniorDeduction(65, 'single', 2029, 50000)).toBe(2050);
    });

    it('inflation-indexes the additional deduction but not the statutory OBBBA amounts', () => {
      expect(seniorDeduction(65, 'single', 2028, 50000, 1.03)).toBeCloseTo(2050 * 1.03 + 6000, 2);
    });
  });

  describe('irmaaAnnualSurcharge', () => {
    it('scales thresholds and surcharges by the inflation factor', () => {
      // $200k MAGI, single, base year: above the $171k tier -> $385/mo * 12
      expect(irmaaAnnualSurcharge(200000, 'single')).toBe(4620);
      // Two years of 3% inflation: the tier threshold rises to ~$181.4k (still crossed)
      // and the surcharge scales with it -> $385 * 1.0609 * 12
      expect(irmaaAnnualSurcharge(200000, 'single', 1.0609)).toBe(4901.36);
    });

    it('a MAGI just over the base-year threshold stops crossing once thresholds inflate', () => {
      expect(irmaaAnnualSurcharge(110000, 'single')).toBe(1148.4); // $95.70/mo * 12
      expect(irmaaAnnualSurcharge(110000, 'single', 1.03)).toBe(0); // threshold now $112,270
    });
  });
});
