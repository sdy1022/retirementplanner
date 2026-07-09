// Approximate historical S&P 500 total annual returns (nominal, dividends reinvested),
// 1994–2024. These are widely published, commonly cited figures used only to shape the
// *distribution* (skew, fat left tail) of a Monte Carlo return generator — not presented as
// an exact historical record. 31 data points is a reasonable bootstrap sample: with
// replacement, any horizon length can be simulated, and the real crash years (2000-02, 2008,
// 2022) give the sampler its downside tail instead of an assumed bell curve.
export const HISTORICAL_SP500_ANNUAL_RETURNS: readonly number[] = [
  0.0132, 0.3758, 0.2296, 0.3336, 0.2858, 0.2104, -0.0910, -0.1189, -0.2210, 0.2868,
  0.1088, 0.0491, 0.1579, 0.0549, -0.3700, 0.2646, 0.1506, 0.0211, 0.1600, 0.3239,
  0.1369, 0.0138, 0.1196, 0.2183, -0.0438, 0.3149, 0.1840, 0.2871, -0.1811, 0.2629,
  0.2502,
];

export function historicalMean(returns: readonly number[]): number {
  return returns.reduce((sum, r) => sum + r, 0) / returns.length;
}

// Small deterministic PRNG (mulberry32) so Monte Carlo runs can be seeded for reproducible
// tests, while real usage seeds from Date.now() for a fresh draw every run.
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mean-adjusted historical bootstrap: draws a random historical year's return (with
// replacement) and shifts it so the *sample* mean lands on targetMean, preserving the
// historical shape (skew, fat tails, magnitude of good/bad years) while honoring whatever
// average return rate the user assumed for the plan.
export function sampleAnnualReturn(
  rng: () => number,
  targetMean: number,
  historicalReturns: readonly number[] = HISTORICAL_SP500_ANNUAL_RETURNS,
): number {
  const shift = targetMean - historicalMean(historicalReturns);
  const index = Math.floor(rng() * historicalReturns.length);
  return historicalReturns[index] + shift;
}
