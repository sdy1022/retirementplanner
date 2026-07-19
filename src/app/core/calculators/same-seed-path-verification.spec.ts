import { createPortfolioMarketSampler, createSeededRng } from './monte-carlo-returns';
import { deriveSeed, sampleDeathAge } from '../mortality/mortality-sampler';

/**
 * Dedicated acceptance coverage for the Compare page's central promise:
 * strategies with the same seed must face the same exogenous history.
 *
 * Allocation changes alter the portfolio return produced for a historical year,
 * but must not alter which year was selected. Mortality is namespaced by trial,
 * so strategy code cannot consume or shift the death-age stream.
 */
describe('same-seed shared path verification', () => {
  const seed = 20260718;

  it('selects exactly the same historical year and CPI path across allocations', () => {
    const allStock = createPortfolioMarketSampler(createSeededRng(seed), 0.06, 1);
    const balanced = createPortfolioMarketSampler(createSeededRng(seed), 0.06, 0.6);
    const conservative = createPortfolioMarketSampler(createSeededRng(seed), 0.06, 0.3);

    const stockPath = Array.from({ length: 40 }, () => allStock());
    const balancedPath = Array.from({ length: 40 }, () => balanced());
    const conservativePath = Array.from({ length: 40 }, () => conservative());

    expect(balancedPath.map((draw) => draw.historicalYear))
      .toEqual(stockPath.map((draw) => draw.historicalYear));
    expect(conservativePath.map((draw) => draw.historicalYear))
      .toEqual(stockPath.map((draw) => draw.historicalYear));
    expect(balancedPath.map((draw) => draw.inflationRate))
      .toEqual(stockPath.map((draw) => draw.inflationRate));
    expect(conservativePath.map((draw) => draw.inflationRate))
      .toEqual(stockPath.map((draw) => draw.inflationRate));

    // The path is shared, but allocation is still allowed to change returns.
    expect(balancedPath.map((draw) => draw.returnRate))
      .not.toEqual(stockPath.map((draw) => draw.returnRate));
  });

  it('keeps each trial independent while reproducing its path for every strategy', () => {
    const path = (trial: number) => {
      const sampler = createPortfolioMarketSampler(
        createSeededRng(deriveSeed(seed, `market-${trial}`)),
        0.06,
        0.6,
      );
      return Array.from({ length: 30 }, () => sampler().historicalYear);
    };

    expect(path(0)).toEqual(path(0));
    expect(path(1)).toEqual(path(1));
    expect(path(0)).not.toEqual(path(1));
  });

  it('reuses identical primary and spouse mortality draws for the same trial namespace', () => {
    const deathAges = (trial: number) => ({
      primary: sampleDeathAge(
        { currentAge: 60, sex: 'male', maximumAge: 110 },
        createSeededRng(deriveSeed(seed, `primary-mortality-${trial}`)),
      ),
      spouse: sampleDeathAge(
        { currentAge: 58, sex: 'female', maximumAge: 110 },
        createSeededRng(deriveSeed(seed, `spouse-mortality-${trial}`)),
      ),
    });

    expect(deathAges(12)).toEqual(deathAges(12));
    // The assertion is deliberately path-level rather than result-level: strategy
    // settings never participate in either mortality namespace.
    expect(deathAges(12).primary).toBeGreaterThanOrEqual(60);
    expect(deathAges(12).spouse).toBeGreaterThanOrEqual(58);
  });
});
