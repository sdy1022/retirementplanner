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

// 10-year US Treasury total returns for the same 1928–2025 years and source as the
// stock series. Keeping both arrays aligned lets the block bootstrap replay the historical
// stock/bond relationship rather than sampling each asset independently.
export const HISTORICAL_10Y_TREASURY_ANNUAL_RETURNS: readonly number[] = [
  0.00835471, 0.04203804, 0.04540931, -0.02558856, 0.08790307, 0.01855272, 0.07963443, 0.04472048, 0.05017875, 0.01379146, 0.04213249, 0.04412261, 0.05402482, -0.02022198, 0.02294868, 0.02490000, 0.02577611, 0.03804417, 0.03128375, 0.00919697, 0.01951037, 0.04663485, 0.00429596, -0.00295314, 0.02267996, 0.04143840, 0.03289803, -0.01336439, -0.02255774, 0.06797013, -0.02099018, -0.02646631, 0.11639504, 0.02060921, 0.05693544, 0.01684162, 0.03728065, 0.00718855, 0.02907941, -0.01580621, 0.03274620, -0.05014049, 0.16754737, 0.09786897, 0.02818449, 0.03658665, 0.01988609, 0.03605254, 0.15984561, 0.01289961, -0.00777581, 0.00670720, -0.02989744, 0.08199215, 0.32814549, 0.03200209, 0.13733364, 0.25712488, 0.24284215, -0.04960509, 0.08223596, 0.17693647, 0.06235375, 0.15004510, 0.09361637, 0.14210958, -0.08036656, 0.23480780, 0.01428608, 0.09939130, 0.14921432, -0.08254215, 0.16655267, 0.05572181, 0.15116400, 0.00375319, 0.04490684, 0.02867533, 0.01961001, 0.10209922, 0.20101280, -0.11116695, 0.08462934, 0.16035335, 0.02971572, -0.09104569, 0.10746180, 0.01284300, 0.00690550, 0.02801716, -0.00016692, 0.09635631, 0.11331898, -0.04416034, -0.17828172, 0.03880000, -0.01637180, 0.07795481
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


export function createPortfolioReturnSampler(
  rng: () => number,
  targetGeometricMean: number,
  stockAllocation: number,
  meanBlockLength: number = DEFAULT_MEAN_BLOCK_LENGTH,
): () => number {
  const stockWeight = Math.min(1, Math.max(0, stockAllocation));
  const portfolioHistory = HISTORICAL_SP500_ANNUAL_RETURNS.map((stock, index) =>
    stockWeight * stock + (1 - stockWeight) * HISTORICAL_10Y_TREASURY_ANNUAL_RETURNS[index],
  );
  return createReturnSampler(rng, targetGeometricMean, portfolioHistory, meanBlockLength);
}

// US CPI-U annual-average inflation, aligned year-for-year with the 1928-2025
// stock and Treasury arrays above. Source: BLS CPI-U annual averages as
// published by the Federal Reserve Bank of Minneapolis. Values are decimal rates.
export const HISTORICAL_US_INFLATION_RATES: readonly number[] = [
  -0.012, 0.000, -0.027, -0.089, -0.103, -0.052, 0.035, 0.026, 0.010, 0.037,
  -0.020, -0.013, 0.007, 0.051, 0.109, 0.060, 0.016, 0.023, 0.085, 0.144,
  0.077, -0.010, 0.011, 0.079, 0.023, 0.008, 0.003, -0.003, 0.015, 0.033,
  0.027, 0.011, 0.015, 0.011, 0.012, 0.012, 0.013, 0.016, 0.030, 0.028,
  0.043, 0.055, 0.058, 0.043, 0.033, 0.062, 0.111, 0.091, 0.057, 0.065,
  0.076, 0.113, 0.135, 0.103, 0.061, 0.032, 0.043, 0.035, 0.019, 0.037,
  0.041, 0.048, 0.054, 0.042, 0.030, 0.030, 0.026, 0.028, 0.030, 0.023,
  0.016, 0.022, 0.034, 0.028, 0.016, 0.023, 0.027, 0.034, 0.032, 0.029,
  0.038, -0.004, 0.016, 0.032, 0.021, 0.015, 0.016, 0.001, 0.013, 0.021,
  0.024, 0.018, 0.012, 0.047, 0.080, 0.041, 0.029, 0.026,
];

export interface HistoricalMarketDraw {
  historicalYear: number;
  returnRate: number;
  inflationRate: number;
}

/**
 * Joint stock/bond/inflation stationary block bootstrap. A single historical
 * index drives all three values, preserving stagflation and recovery regimes.
 * The portfolio return is geometrically shifted to the scenario target; CPI is
 * never shifted.
 */
export function createPortfolioMarketSampler(
  rng: () => number,
  targetGeometricMean: number,
  stockAllocation: number,
  meanBlockLength: number = DEFAULT_MEAN_BLOCK_LENGTH,
): () => HistoricalMarketDraw {
  if (HISTORICAL_US_INFLATION_RATES.length !== HISTORICAL_SP500_ANNUAL_RETURNS.length) {
    throw new Error('Historical market and inflation series must be aligned.');
  }
  const stockWeight = Math.min(1, Math.max(0, stockAllocation));
  const portfolioHistory = HISTORICAL_SP500_ANNUAL_RETURNS.map((stock, index) =>
    stockWeight * stock + (1 - stockWeight) * HISTORICAL_10Y_TREASURY_ANNUAL_RETURNS[index],
  );
  const shift = shiftForGeometricMean(targetGeometricMean, portfolioHistory);
  const count = portfolioHistory.length;
  let index = -1;
  return () => {
    index = index >= 0 && rng() >= 1 / meanBlockLength
      ? (index + 1) % count
      : Math.floor(rng() * count);
    return {
      historicalYear: 1928 + index,
      returnRate: portfolioHistory[index] + shift,
      inflationRate: HISTORICAL_US_INFLATION_RATES[index],
    };
  };
}
