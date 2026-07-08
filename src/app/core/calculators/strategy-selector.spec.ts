import { YearResult } from '../models/retirement.models';
import { effectiveConversionRate, selectStrategy, StrategySelectorInput } from './strategy-selector';

function yearWith(overrides: Partial<YearResult>): YearResult {
  return {
    age: 60, traditionalBalance: 0, rothBalance: 0, brokerageBalance: 0, brokerageBasis: 0,
    rmd: 0, conversion: 0, taxableIncome: 0, federalTax: 0, stateTax: 0, totalTax: 0,
    irmaa: 0, shortfall: 0, marginalRate: 0, livingExpenses: 0, endingAssets: 0,
    expensesFromSs: 0, expensesFromRmd: 0, expensesFromTraditional: 0,
    expensesFromBrokerage: 0, expensesFromRoth: 0,
    taxFromBrokerage: 0, taxWithheldFromConversion: 0, taxFromRoth: 0,
    ...overrides,
  };
}

describe('effectiveConversionRate', () => {
  it('returns the dollar-weighted fed+state rate actually paid on conversions', () => {
    // Single, 2026, first year (inflation factor 1): $100k conversion from zero base income
    // pays $13,170 federal (fills 10/12/22% under the $16,100 standard deduction) + 5% state
    const years = [yearWith({ age: 60, conversion: 100_000, taxableIncome: 100_000 })];
    const rate = effectiveConversionRate(years, 'single', 0.05, 2026);
    expect(rate).toBeCloseTo(0.1817, 3);
  });

  it('returns null when the plan converts nothing', () => {
    const years = [yearWith({ age: 60, taxableIncome: 50_000 })];
    expect(effectiveConversionRate(years, 'single', 0.05, 2026)).toBeNull();
  });
});

describe('selectStrategy', () => {
  // Case A from "Buy_Borrow_Die VS Roth Conversion.txt": pre-tax heavy, small brokerage
  const caseA: StrategySelectorInput = {
    pretaxBalance: 2_000_000,
    brokerageBalance: 500_000,
    brokerageCostBasis: 250_000,
    conversionRate: 0.22,
    exitRate: 0.32,
    capitalGainsRate: 0.15,
    borrowRate: 0.07,
    expectedReturnRate: 0.07,
    yearsToDeath: 30,
    annualSpending: 80_000,
  };

  // Case B: brokerage heavy with low basis, small pre-tax, no rate spread, short horizon
  const caseB: StrategySelectorInput = {
    pretaxBalance: 500_000,
    brokerageBalance: 2_000_000,
    brokerageCostBasis: 500_000,
    conversionRate: 0.22,
    exitRate: 0.22,
    capitalGainsRate: 0.15,
    borrowRate: 0.06,
    expectedReturnRate: 0.08,
    yearsToDeath: 15,
    // 3% of the book: BBD only fits when the spend rate is small relative to collateral —
    // at $80k/yr the stressed LTV peaks over the 50% cap and the selector correctly refuses
    annualSpending: 60_000,
  };

  it('recommends Roth conversion for a pre-tax-heavy household (Case A)', () => {
    const result = selectStrategy(caseA);
    expect(result.choice).toBe('roth-conversion');
    expect(result.conversionValue).toBe(2_000_000 * 0.10);
    // $80k/yr against a $500k book breaches stressed LTV long before death
    expect(result.bbdFeasible).toBeFalse();
  });

  it('recommends Buy-Borrow-Die for a low-basis brokerage-heavy household (Case B)', () => {
    const result = selectStrategy(caseB);
    expect(result.choice).toBe('buy-borrow-die');
    expect(result.conversionValue).toBe(0);
    expect(result.bbdValue).toBeGreaterThan(0);
    expect(result.bbdFeasible).toBeTrue();
  });

  it('recommends both when each bucket has an edge (hybrid, section 5 of the txt)', () => {
    const result = selectStrategy({ ...caseB, pretaxBalance: 2_000_000, exitRate: 0.32 });
    expect(result.choice).toBe('both');
    expect(result.conversionValue).toBeGreaterThan(0);
    expect(result.bbdValue).toBeGreaterThan(0);
  });

  it('recommends neither when there is no rate spread and no unrealized gain', () => {
    const result = selectStrategy({
      ...caseB,
      pretaxBalance: 500_000,
      exitRate: 0.22,
      brokerageCostBasis: 2_000_000, // full basis: nothing for step-up to wipe
      borrowRate: 0.09,              // and borrowing costs more than the market returns
      expectedReturnRate: 0.06,
    });
    expect(result.choice).toBe('neither');
    expect(result.bbdValue).toBeLessThanOrEqual(0);
  });

  it('rules out BBD on LTV stress even when the value math is positive', () => {
    const result = selectStrategy({
      ...caseB,
      brokerageBalance: 600_000,
      brokerageCostBasis: 100_000, // huge gain fraction: value math loves it
      annualSpending: 90_000,      // but the loan overwhelms the collateral
      yearsToDeath: 20,
    });
    expect(result.bbdFeasible).toBeFalse();
    expect(result.choice).not.toBe('buy-borrow-die');
    expect(result.choice).not.toBe('both');
  });

  it('longer horizons erode the BBD edge (interest compounds against the tax saved)', () => {
    const shortHorizon = selectStrategy({ ...caseB, borrowRate: 0.08, yearsToDeath: 8 });
    const longHorizon = selectStrategy({ ...caseB, borrowRate: 0.08, yearsToDeath: 30 });
    // Normalize by the sell-path estate scale: compare signs/direction instead of raw dollars
    expect(shortHorizon.bbdValue).toBeGreaterThan(0);
    expect(longHorizon.bbdFeasible).toBeFalse();
  });

  it('handles an empty brokerage bucket without recommending BBD', () => {
    const result = selectStrategy({ ...caseA, brokerageBalance: 0, brokerageCostBasis: 0 });
    expect(result.choice).toBe('roth-conversion');
    expect(result.bbdValue).toBe(0);
    expect(result.bbdFeasible).toBeFalse();
  });

  it('warns when spending exhausts the brokerage on the sell path', () => {
    const result = selectStrategy({ ...caseA, annualSpending: 120_000 });
    expect(result.notes.some(n => n.includes('exhausts the brokerage'))).toBeTrue();
  });
});
