import { createReturnSampler, createSeededRng, geometricMean, historicalMean, HISTORICAL_SP500_ANNUAL_RETURNS, shiftForGeometricMean } from './monte-carlo-returns';

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
