import { YearResult } from '../models/retirement.models';
import { effectiveConversionRate, selectStrategy, StrategySelectorInput } from './strategy-selector';

function yearWith(overrides: Partial<YearResult>): YearResult {
  return {
    age: 60, traditionalBalance: 0, rothBalance: 0, brokerageBalance: 0, brokerageBasis: 0,
    rmd: 0, conversion: 0, taxableIncome: 0, federalTax: 0, stateTax: 0, totalTax: 0,
    irmaa: 0, shortfall: 0, marginalRate: 0, livingExpenses: 0, endingAssets: 0,
    expensesFromSs: 0, expensesFromRmd: 0, expensesFromTraditional: 0,
    expensesFromBrokerage: 0, expensesFromRoth: 0,
    taxFromBrokerage: 0, taxWithheldFromConversion: 0, taxFromTraditional: 0, taxFromRoth: 0,
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

  it('keeps BBD feasible when backstop liquid assets can cure the stressed margin call', () => {
    // Case B at $80k/yr breaches the stressed LTV cap on its own (peaks ~53%)…
    const noBackstop = selectStrategy({ ...caseB, annualSpending: 80_000 });
    expect(noBackstop.bbdFeasible).toBeFalse();
    // …but a Roth backstop large enough to pay the loan down under the cap cures it
    const withBackstop = selectStrategy({ ...caseB, annualSpending: 80_000, backstopLiquidAssets: 500_000 });
    expect(withBackstop.bbdFeasible).toBeTrue();
    expect(withBackstop.choice).toBe('buy-borrow-die');
    expect(withBackstop.notes.some(n => n.includes('backstop could cure'))).toBeTrue();
  });

  it('backstop never rescues a breach larger than the backstop itself', () => {
    const result = selectStrategy({
      ...caseB,
      brokerageBalance: 600_000,
      annualSpending: 90_000,
      yearsToDeath: 20,
      backstopLiquidAssets: 200_000, // cure needs far more than this
    });
    expect(result.bbdFeasible).toBeFalse();
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

describe('BBD loan stays inside the lender\'s LTV cap', () => {
  // The shape an external review flagged: a small brokerage asked to fund large spending
  // for a long horizon. Before the brake, debt compounded past any collateral that could
  // secure it — ~$15M against a $500k account, a 563% stressed LTV, and a headline "BBD
  // value" of -$12M that no broker would ever have let happen.
  const overReaching: StrategySelectorInput = {
    pretaxBalance: 1_500_000,
    brokerageBalance: 500_000,
    brokerageCostBasis: 500_000,
    conversionRate: 0.24,
    exitRate: 0.24,
    capitalGainsRate: 0.15,
    borrowRate: 0.06,
    expectedReturnRate: 0.08,
    yearsToDeath: 30,
    annualSpending: 150_000,
  };

  // Same rates, but collateral large enough that the line is never fully drawn.
  const wellCollateralised: StrategySelectorInput = {
    ...overReaching,
    brokerageBalance: 3_000_000,
    brokerageCostBasis: 750_000,
    annualSpending: 90_000,
  };

  it('never reports a stressed LTV that implies lending past the collateral', () => {
    const { peakStressedLtv } = selectStrategy(wellCollateralised);
    // With draws capped at 50% of collateral, a 40% crash can push the ratio to at most
    // 0.5 / (1 - 0.4) = 83%. Anything beyond that means the brake is not being applied.
    expect(peakStressedLtv).toBeLessThanOrEqual(0.5 / 0.6 + 1e-9);
  });

  it('reports a finite ratio even when the account is drained to nothing', () => {
    // A ratio against zero collateral is not a number worth printing; the depletion is
    // reported as a fact instead.
    const { peakStressedLtv } = selectStrategy(overReaching);
    expect(Number.isFinite(peakStressedLtv)).toBeTrue();
  });

  it('keeps the borrow-vs-sell comparison within an order of magnitude of the account', () => {
    const { bbdValue } = selectStrategy(overReaching);
    // The old unbounded loan produced -$11.9M on a $500k account. The comparison is only
    // meaningful while both paths stay anchored to assets that actually exist.
    expect(Math.abs(bbdValue)).toBeLessThan(500_000 * 20);
  });

  it('says plainly that the bucket cannot fund the plan at all', () => {
    const { bbdFeasible, notes } = selectStrategy(overReaching);
    expect(bbdFeasible).toBeFalse();
    expect(notes.some((n) => n.includes('exhausts the brokerage before death'))).toBeTrue();
  });

  it('still lets a well-collateralised plan borrow without forced sales', () => {
    const { notes } = selectStrategy(wellCollateralised);
    expect(notes.some((n) => n.includes('had to be funded by selling anyway'))).toBeFalse();
  });
});
