import { createSeededRng, historicalMean, HISTORICAL_SP500_ANNUAL_RETURNS, sampleAnnualReturn } from './monte-carlo-returns';

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

  it('sampleAnnualReturn only ever draws real historical years, shifted by a constant', () => {
    const rng = createSeededRng(7);
    const shift = 0.06 - historicalMean(HISTORICAL_SP500_ANNUAL_RETURNS);
    const shiftedHistorical = new Set(HISTORICAL_SP500_ANNUAL_RETURNS.map(r => Math.round((r + shift) * 1e8) / 1e8));
    for (let i = 0; i < 500; i++) {
      const draw = Math.round(sampleAnnualReturn(rng, 0.06) * 1e8) / 1e8;
      expect(shiftedHistorical.has(draw)).toBe(true);
    }
  });

  it('mean-adjusts the historical distribution to the target mean over many draws', () => {
    const rng = createSeededRng(123);
    const targetMean = 0.07;
    const n = 20000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sampleAnnualReturn(rng, targetMean);
    // Bootstrap draws are noisy at 20k samples but should land close to the target mean
    // (shape/variance come from history; only the mean is anchored to the input).
    expect(sum / n).toBeCloseTo(targetMean, 2);
  });

  it('preserves the historical downside tail (a real crash year is reachable)', () => {
    const rng = createSeededRng(99);
    const draws = Array.from({ length: 2000 }, () => sampleAnnualReturn(rng, 0.07));
    expect(Math.min(...draws)).toBeLessThan(-0.2);
  });
});
