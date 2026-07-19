import { simulateConversionStrategy } from './roth-conversion-calculator';
import { createPortfolioMarketSampler, HISTORICAL_US_INFLATION_RATES } from './monte-carlo-returns';

describe('survivor RMD ownership and historical inflation', () => {
  const accounts = [{ type: 'traditional_ira' as const, balance: 100000, snapshotDate: '2026-01-01' }];
  const base = {
    accounts,
    strategy: { mode: 'none' as const },
    filingStatus: 'married_filing_jointly' as const,
    assumedReturnRate: 0,
    stateTaxRate: 0,
    annualLivingExpenses: 0,
    wageIncome: 0,
  };

  it('uses the younger surviving spouse RMD schedule beginning the year after primary death', () => {
    const years = simulateConversionStrategy({
      ...base,
      currentAge: 74,
      endAge: 76,
      birthYear: 1952,
      primaryLifeExpectancy: 74,
      spouseCurrentAge: 70,
      spouseBirthYear: 1956,
      spouseLifeExpectancy: 90,
    });
    expect(years[0].rmd).toBe(3921.57); // death year: primary age 74
    expect(years[1].rmd).toBe(0);       // next year: spouse age 71, start age 75
  });

  it('starts RMD immediately when the older spouse becomes sole survivor', () => {
    const years = simulateConversionStrategy({
      ...base,
      currentAge: 70,
      endAge: 72,
      birthYear: 1956,
      primaryLifeExpectancy: 70,
      spouseCurrentAge: 74,
      spouseBirthYear: 1952,
      spouseLifeExpectancy: 90,
    });
    expect(years[0].rmd).toBe(0);       // death year still primary schedule
    expect(years[1].rmd).toBe(4065.04); // next year spouse is age 75 and already RMD-eligible
  });

  it('samples stock, bond, and CPI from the same historical year', () => {
    const index1974 = 1974 - 1928;
    const rng = () => (index1974 + 0.5) / 98;
    const draw = createPortfolioMarketSampler(rng, 0.06, 0.6)();
    expect(draw.historicalYear).toBe(1974);
    expect(draw.inflationRate).toBe(HISTORICAL_US_INFLATION_RATES[index1974]);
    expect(draw.inflationRate).toBeCloseTo(0.111, 3);
  });

  it('uses prior-year sampled CPI for both expenses and Social Security COLA', () => {
    const years = simulateConversionStrategy({
      accounts: [], strategy: { mode: 'none' }, currentAge: 67, endAge: 68,
      birthYear: 1959, filingStatus: 'single', assumedReturnRate: 0, stateTaxRate: 0,
      annualLivingExpenses: 10000, ssPia: 1000, ssClaimAge: 67, ssColaRate: 0.99,
      inflationRateForYear: () => 0.10,
    });
    expect(years[0].plannedLivingExpenses).toBe(10000);
    expect(years[1].plannedLivingExpenses).toBe(11000);
    expect(years[0].expensesFromSs).toBe(10000);
    expect(years[1].expensesFromSs).toBe(11000);
  });
});
