import { createPortfolioMarketSampler, createReturnSampler, createPortfolioReturnSampler, createSeededRng, geometricMean, historicalMean, HISTORICAL_SP500_ANNUAL_RETURNS, shiftForGeometricMean } from './monte-carlo-returns';

describe('monte-carlo-returns', () => {
  it('createSeededRng is deterministic for a given seed and stays within [0, 1)', () => {
    const rngA = createSeededRng(42);
    const rngB = createSeededRng(42);
    const drawsA = Array.from({ length: 20 }, () => rngA());
    const drawsB = Array.from({ length: 20 }, () => rngB());
    expect(drawsA).toEqual(drawsB);
    for (const draw of drawsA) {
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThan(1);
    }
  });

  it('different seeds produce different sequences', () => {
    const rngA = createSeededRng(1);
    const rngB = createSeededRng(2);
    const drawsA = Array.from({ length: 10 }, () => rngA());
    const drawsB = Array.from({ length: 10 }, () => rngB());
    expect(drawsA).not.toEqual(drawsB);
  });

  it('shiftForGeometricMean lands the shifted sample geometric mean exactly on target', () => {
    const target = 0.06;
    const shift = shiftForGeometricMean(target);
    const shifted = HISTORICAL_SP500_ANNUAL_RETURNS.map((r) => r + shift);
    expect(geometricMean(shifted)).toBeCloseTo(target, 8);
  });

  it('the sampler only ever draws real historical years, shifted by that constant', () => {
    const rng = createSeededRng(7);
    const sample = createReturnSampler(rng, 0.06);
    const shift = shiftForGeometricMean(0.06);
    const shiftedHistorical = new Set(HISTORICAL_SP500_ANNUAL_RETURNS.map(r => Math.round((r + shift) * 1e8) / 1e8));
    for (let i = 0; i < 500; i++) {
      const draw = Math.round(sample() * 1e8) / 1e8;
      expect(shiftedHistorical.has(draw)).toBe(true);
    }
  });

  it('draws compound at the target rate over the long run (geometric mean anchored)', () => {
    const rng = createSeededRng(123);
    const target = 0.07;
    const sample = createReturnSampler(rng, target);
    // Block sampling autocorrelates draws, shrinking the effective sample size by the mean
    // block length, so use a larger n than an iid test would need.
    const n = 60000;
    let logSum = 0;
    for (let i = 0; i < n; i++) logSum += Math.log(1 + sample());
    const compoundRate = Math.exp(logSum / n) - 1;
    // Bootstrap draws are noisy but the long-run compound growth should land close to the
    // target (shape/variance come from history; only the CAGR is anchored).
    expect(compoundRate).toBeCloseTo(target, 2);
  });

  it('replays consecutive historical years in blocks instead of sampling iid', () => {
    const rng = createSeededRng(5);
    const sample = createReturnSampler(rng, 0.07);
    const shift = shiftForGeometricMean(0.07);
    const round = (v: number) => Math.round(v * 1e8) / 1e8;
    const indexByValue = new Map(HISTORICAL_SP500_ANNUAL_RETURNS.map((r, i) => [round(r + shift), i]));
    const draws = Array.from({ length: 4000 }, () => indexByValue.get(round(sample()))!);
    let adjacent = 0;
    for (let i = 1; i < draws.length; i++) {
      if (draws[i] === (draws[i - 1] + 1) % HISTORICAL_SP500_ANNUAL_RETURNS.length) adjacent++;
    }
    // With mean block length 5, ~80% of draws continue the historical sequence (a crash year
    // is usually followed by the year that actually followed it), vs ~3% under iid sampling.
    const continuationRate = adjacent / (draws.length - 1);
    expect(continuationRate).toBeGreaterThan(0.7);
    expect(continuationRate).toBeLessThan(0.9);
  });

  it('a fresh sampler per trial (sharing one rng) does not carry the block-continuation state across trials', () => {
    // Regression test for a bug where monte-carlo.ts built one createReturnSampler and reused
    // its closure across every Monte Carlo trial: the block-bootstrap's continue/jump state
    // then bled across trial boundaries, stitching thousands of "independent" trials into one
    // long correlated path (~81% of trial boundaries silently continued the previous trial's
    // sequence). The fix is to call createReturnSampler fresh inside each trial while still
    // drawing from the same shared rng — this asserts that pattern actually restores
    // independence at trial boundaries.
    const rng = createSeededRng(5);
    const shift = shiftForGeometricMean(0.07);
    const round = (v: number) => Math.round(v * 1e8) / 1e8;
    const indexByValue = new Map(HISTORICAL_SP500_ANNUAL_RETURNS.map((r, i) => [round(r + shift), i]));
    const yearsPerTrial = 30;
    const nTrials = 2000;

    let prevLastIndex: number | null = null;
    let firstContinuesPrevLast = 0;
    for (let t = 0; t < nTrials; t++) {
      const sample = createReturnSampler(rng, 0.07); // fresh sampler per trial, shared rng
      let firstIndex: number | null = null;
      let lastIndex = -1;
      for (let y = 0; y < yearsPerTrial; y++) {
        lastIndex = indexByValue.get(round(sample()))!;
        if (firstIndex === null) firstIndex = lastIndex;
      }
      if (prevLastIndex !== null && firstIndex === (prevLastIndex + 1) % HISTORICAL_SP500_ANNUAL_RETURNS.length) {
        firstContinuesPrevLast++;
      }
      prevLastIndex = lastIndex;
    }

    // With independent trials this should be close to 1/98 (~1%); the leaked-state bug made
    // it ~81%. Leave generous headroom above chance to avoid a flaky test.
    expect(firstContinuesPrevLast / (nTrials - 1)).toBeLessThan(0.1);
  });

  it('anchoring the geometric mean puts the arithmetic mean above the target (volatility drag compensation)', () => {
    const target = 0.07;
    const shift = shiftForGeometricMean(target);
    const shiftedArithmeticMean = historicalMean(HISTORICAL_SP500_ANNUAL_RETURNS) + shift;
    // With equity-like volatility the drag is ~1-2 points; the arithmetic mean must sit
    // above the target CAGR by roughly that much, never below it.
    expect(shiftedArithmeticMean).toBeGreaterThan(target);
    expect(shiftedArithmeticMean).toBeLessThan(target + 0.03);
  });

  it('preserves the historical downside tail (a real crash year is reachable)', () => {
    const rng = createSeededRng(99);
    const sample = createReturnSampler(rng, 0.07);
    const draws = Array.from({ length: 2000 }, () => sample());
    expect(Math.min(...draws)).toBeLessThan(-0.2);
  });
});

describe('portfolio return sampler', () => {
  it('uses the aligned stock/bond history and preserves the requested long-run CAGR', () => {
    const rng = createSeededRng(42);
    const sampler = createPortfolioReturnSampler(rng, 0.06, 0.6, 1);
    const draws = Array.from({ length: 50000 }, () => sampler());
    expect(geometricMean(draws)).toBeCloseTo(0.06, 2);
  });

  it('produces lower dispersion for a balanced allocation than all stocks with the same seed', () => {
    const stocks = Array.from({ length: 5000 }, createPortfolioReturnSampler(createSeededRng(7), 0.06, 1, 1));
    const balanced = Array.from({ length: 5000 }, createPortfolioReturnSampler(createSeededRng(7), 0.06, 0.6, 1));
    const sd = (values: number[]) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    };
    expect(sd(balanced)).toBeLessThan(sd(stocks));
  });
});

describe('same-seed path sharing (strategy comparison invariant)', () => {
  it('variants that differ only in allocation see the identical historical-year sequence', () => {
    // The strategy-comparison page's whole premise: two variants started from the same
    // seed must walk the same historical years, so outcome differences come only from the
    // strategy inputs. The sampler's rng consumption is allocation-independent (the
    // continue/jump decision never looks at the portfolio), so the year sequences — and
    // therefore the CPI draws — must match element for element.
    const a = createPortfolioMarketSampler(createSeededRng(20260718), 0.06, 1.0);
    const b = createPortfolioMarketSampler(createSeededRng(20260718), 0.06, 0.4);
    for (let i = 0; i < 2000; i++) {
      const drawA = a();
      const drawB = b();
      expect(drawA.historicalYear).toBe(drawB.historicalYear);
      expect(drawA.inflationRate).toBe(drawB.inflationRate);
    }
  });

  it('the same sampler configuration replayed from the same seed is exactly reproducible', () => {
    const first = Array.from({ length: 500 }, createPortfolioMarketSampler(createSeededRng(11), 0.07, 0.6));
    const second = Array.from({ length: 500 }, createPortfolioMarketSampler(createSeededRng(11), 0.07, 0.6));
    expect(first).toEqual(second);
  });
});
