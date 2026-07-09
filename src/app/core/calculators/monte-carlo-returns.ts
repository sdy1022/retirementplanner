// Historical S&P 500 total annual returns (nominal, dividends reinvested), 1928–2025,
// in chronological order (the block bootstrap depends on adjacency). Source: Aswath
// Damodaran, NYU Stern, "Historical Returns on Stocks, Bonds and Bills" dataset
// (pages.stern.nyu.edu/~adamodar → histretSP), retrieved July 2026. 98 years covers the
// Great Depression sequence (1929–32, including −43.8% in 1931), the 1973–74 and 2000–02
// bears, and 2008 — so the sampler's downside tail comes from real history, including
// depression-scale multi-year drawdowns, instead of an assumed bell curve.
export const HISTORICAL_SP500_ANNUAL_RETURNS: readonly number[] = [
  /* 1928–1937 */ 0.4381, -0.0830, -0.2512, -0.4384, -0.0864, 0.4998, -0.0119, 0.4674, 0.3194, -0.3534,
  /* 1938–1947 */ 0.2928, -0.0110, -0.1067, -0.1277, 0.1917, 0.2506, 0.1903, 0.3582, -0.0843, 0.0520,
  /* 1948–1957 */ 0.0570, 0.1830, 0.3081, 0.2368, 0.1815, -0.0121, 0.5256, 0.3260, 0.0744, -0.1046,
  /* 1958–1967 */ 0.4372, 0.1206, 0.0034, 0.2664, -0.0881, 0.2261, 0.1642, 0.1240, -0.0997, 0.2380,
  /* 1968–1977 */ 0.1081, -0.0824, 0.0356, 0.1422, 0.1876, -0.1431, -0.2590, 0.3700, 0.2383, -0.0698,
  /* 1978–1987 */ 0.0651, 0.1852, 0.3174, -0.0470, 0.2042, 0.2234, 0.0615, 0.3124, 0.1849, 0.0581,
  /* 1988–1997 */ 0.1654, 0.3148, -0.0306, 0.3023, 0.0749, 0.0997, 0.0133, 0.3720, 0.2268, 0.3310,
  /* 1998–2007 */ 0.2834, 0.2089, -0.0903, -0.1185, -0.2197, 0.2836, 0.1074, 0.0483, 0.1561, 0.0548,
  /* 2008–2017 */ -0.3655, 0.2594, 0.1482, 0.0210, 0.1589, 0.3215, 0.1352, 0.0138, 0.1177, 0.2161,
  /* 2018–2025 */ -0.0423, 0.3121, 0.1802, 0.2847, -0.1804, 0.2606, 0.2488, 0.1778,
];

export function historicalMean(returns: readonly number[]): number {
  return returns.reduce((sum, r) => sum + r, 0) / returns.length;
}

// Long-run compound growth rate of a return sequence — what a buy-and-hold dollar
// actually earns per year, always below the arithmetic mean when returns vary
export function geometricMean(returns: readonly number[]): number {
  const logSum = returns.reduce((sum, r) => sum + Math.log(1 + r), 0);
  return Math.exp(logSum / returns.length) - 1;
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

// Constant shift that makes the *geometric* mean of the shifted historical sample equal
// targetGeometricMean. Anchoring the arithmetic mean instead would embed volatility drag
// (≈ σ²/2, about 1.5 points at equity-like volatility): paths would compound ~1.5% per year
// slower than the deterministic plan that uses the same assumed rate, so every Monte Carlo
// median would look worse than the flat-rate projection by construction. The geometric mean
// of (r + s) is strictly increasing in s, so a simple bisection solves it.
export function shiftForGeometricMean(
  targetGeometricMean: number,
  historicalReturns: readonly number[] = HISTORICAL_SP500_ANNUAL_RETURNS,
): number {
  const worstReturn = Math.min(...historicalReturns);
  // Keep every shifted return above -100% so log(1 + r + s) stays defined
  let lo = -worstReturn - 1 + 1e-6;
  let hi = 1;
  for (let i = 0; i < 100 && hi - lo > 1e-12; i++) {
    const mid = (lo + hi) / 2;
    if (geometricMean(historicalReturns.map((r) => r + mid)) < targetGeometricMean) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

// Mean block length (years) for the stationary block bootstrap: long enough to keep
// multi-year bear runs (2000-02, 2007-09) intact most of the time, short enough that a
// 30-year path still mixes several distinct historical regimes.
export const DEFAULT_MEAN_BLOCK_LENGTH = 5;

// Stationary block bootstrap sampler (Politis–Romano): each draw continues the historical
// sequence from the previous draw with probability 1 − 1/meanBlockLength, and jumps to a
// fresh uniformly random year otherwise (wrapping 2024 → 1994 circularly). Unlike iid
// year-by-year sampling, this replays real multi-year crash and boom sequences — the
// sequence-of-returns risk that dominates retirement outcomes — while the uniform restart
// keeps every historical year equally likely in the long run. Draws are shifted by a
// precomputed constant so the paths still compound at the user's assumed rate.
export function createReturnSampler(
  rng: () => number,
  targetGeometricMean: number,
  historicalReturns: readonly number[] = HISTORICAL_SP500_ANNUAL_RETURNS,
  meanBlockLength: number = DEFAULT_MEAN_BLOCK_LENGTH,
): () => number {
  const shift = shiftForGeometricMean(targetGeometricMean, historicalReturns);
  const count = historicalReturns.length;
  let index = -1;
  return () => {
    index = index >= 0 && rng() >= 1 / meanBlockLength
      ? (index + 1) % count
      : Math.floor(rng() * count);
    return historicalReturns[index] + shift;
  };
}
